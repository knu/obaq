;;; obaq-mode.el --- Render Obsidian Base blocks -*- lexical-binding: t; -*-

;; Copyright (c) 2026 Akinori Musha
;;
;; All rights reserved.
;;
;; Redistribution and use in source and binary forms, with or without
;; modification, are permitted provided that the following conditions
;; are met:
;; 1. Redistributions of source code must retain the above copyright
;;    notice, this list of conditions and the following disclaimer.
;; 2. Redistributions in binary form must reproduce the above copyright
;;    notice, this list of conditions and the following disclaimer in the
;;    documentation and/or other materials provided with the distribution.
;;
;; THIS SOFTWARE IS PROVIDED BY THE AUTHOR AND CONTRIBUTORS ``AS IS'' AND
;; ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
;; IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
;; ARE DISCLAIMED.  IN NO EVENT SHALL THE AUTHOR OR CONTRIBUTORS BE LIABLE
;; FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
;; DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS
;; OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION)
;; HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT
;; LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY
;; OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF
;; SUCH DAMAGE.

;; Author: Akinori Musha <knu@iDaemons.org>
;; URL: https://github.com/knu/obaq
;; Keywords: obsidian, tools
;; Version: 0.1.0
;; Package-Requires: ((emacs "27.2"))

;;; Commentary:

;; Render ```base code blocks in Obsidian notes by invoking the obaq CLI.
;; The rendered output is read-only, and toggled on/off by commands.
;; This package expects obsidian.el and markdown-mode to be installed.

;;; Code:

(require 'cl-lib)
(require 'subr-x)
(autoload 'markdown-next-link "markdown-mode" nil t)
(autoload 'markdown-previous-link "markdown-mode" nil t)
(autoload 'gfm-view-mode "markdown-mode" nil t)
(autoload 'obsidian-follow-link-at-point "obsidian" nil t)
(defvar obsidian-directory)

(defgroup obaq nil
  "Obaq integration for Obsidian buffers."
  :group 'tools
  :prefix "obaq-")

(defcustom obaq-mode-command "obaq"
  "Command name or path for the obaq CLI."
  :type 'string
  :group 'obaq)

(defcustom obaq-mode-format "markdown"
  "Output format to render base blocks."
  :type 'string
  :group 'obaq)

(defcustom obaq-enable-code-block-formatter-p nil
  "Enable formatter execution for code blocks with formatter attributes.
When non-nil, code fences like ```lang formatter=NAME are replaced by
the output of the executable at VAULT/.bin/NAME (VAULT is
`obsidian-directory').  The block contents are sent on stdin and the
command output is inserted as markdown.  The formatter is invoked only
in `obaq-view-mode'; if the executable is missing or not executable,
the block is left unchanged.  The environment variables CODE_FENCE and
CODE_LANGUAGE are set to the fence line and language name."
  :type 'boolean
  :group 'obaq)

(defcustom obaq-auto-view-enter-p nil
  "Automatically enter `obaq-view-mode' when renderable blocks exist.
When non-nil, enabling `obaq-buffer-mode' will automatically switch into
`obaq-view-mode' if the buffer contains renderable base or formatter
blocks.  Auto-enter runs once per buffer, even across major mode changes."
  :type 'boolean
  :group 'obaq)

(defvar obaq-view-mode)
(defvar-local obaq-mode--auto-view-entered-p nil)
(put 'obaq-mode--auto-view-entered-p 'permanent-local t)

(defun obaq-mode--buffer-path ()
  "Return the absolute path for the current buffer."
  (or buffer-file-name
      (error "Buffer is not visiting a file")))

(defun obaq-mode--resolve-command ()
  "Return the resolved obaq command path."
  (if (file-name-absolute-p obaq-mode-command)
      obaq-mode-command
    (let ((root (locate-dominating-file (obaq-mode--buffer-path) "package.json")))
      (if root
          (expand-file-name obaq-mode-command root)
        obaq-mode-command))))

(defun obaq-mode--base-blocks ()
  "Return a list of base block plists in the current buffer."
  (save-excursion
    (goto-char (point-min))
    (let (blocks)
      (while (re-search-forward "^```[ \t]*base\\b.*$" nil t)
        (let ((block-start (match-beginning 0)))
          (forward-line 1)
          (let ((content-start (point)))
            (if (re-search-forward "^```[ \t]*$" nil t)
                (let* ((content-end (match-beginning 0))
                       (block-end (match-end 0))
                       (content (buffer-substring-no-properties
                                 content-start
                                 content-end))
                       (raw (buffer-substring-no-properties
                             block-start
                             block-end)))
                  (push (list :start block-start
                              :end block-end
                              :content content
                              :raw raw)
                        blocks))
              (goto-char (point-max))))))
      (nreverse blocks))))

(defun obaq-mode--formatter-info (line)
  "Return formatter info plist from a code fence LINE, or nil."
  (save-match-data
    (when (string-match "^```[ \t]*\\([^ \t\n]*\\)\\(.*\\)$" line)
      (let ((lang (match-string 1 line))
            (attrs (match-string 2 line)))
        (when (and (not (string-empty-p lang))
                   (not (string= lang "base"))
                   (string-match "\\bformatter=\\([A-Za-z0-9_.-]+\\)\\b" attrs))
          (list :lang lang
                :formatter (match-string 1 attrs)
                :fence line))))))

(defun obaq-mode--formatter-blocks ()
  "Return a list of formatter block plists in the current buffer."
  (save-excursion
    (goto-char (point-min))
    (let (blocks)
      (while (re-search-forward "^```" nil t)
        (let* ((block-start (match-beginning 0))
               (line (buffer-substring-no-properties
                      (line-beginning-position)
                      (line-end-position)))
               (info (obaq-mode--formatter-info line)))
          (when info
            (forward-line 1)
            (let ((content-start (point)))
              (if (re-search-forward "^```[ \t]*$" nil t)
                  (let* ((content-end (match-beginning 0))
                         (block-end (match-end 0))
                         (content (buffer-substring-no-properties
                                   content-start
                                   content-end))
                         (raw (buffer-substring-no-properties
                               block-start
                               block-end)))
                    (push (list :start block-start
                                :end block-end
                                :content content
                                :raw raw
                                :formatter (plist-get info :formatter)
                                :fence-line (plist-get info :fence)
                                :lang (plist-get info :lang))
                          blocks))
                (goto-char (point-max)))))))
      (nreverse blocks))))

(defun obaq-mode--block-at-point ()
  "Return the base block plist at point, or nil."
  (let ((pos (point)))
    (cl-find-if (lambda (block)
                  (and (<= (plist-get block :start) pos)
                       (<= pos (plist-get block :end))))
                (obaq-mode--base-blocks))))

(defun obaq-mode--resolve-formatter-command (formatter vault)
  "Return the formatter command path for FORMATTER in VAULT."
  (expand-file-name (concat ".bin/" formatter) vault))

(defun obaq-mode--format-block (block)
  "Render formatter BLOCK by invoking the formatter command."
  (let* ((content (plist-get block :content))
         (formatter (plist-get block :formatter))
         (fence-line (plist-get block :fence-line))
         (lang (plist-get block :lang))
         (vault obsidian-directory)
         (buffer-path (obaq-mode--buffer-path))
         (default-directory (file-name-directory buffer-path))
         (command (obaq-mode--resolve-formatter-command formatter vault)))
    (unless vault
      (error "Missing obsidian-directory"))
    (unless (file-executable-p command)
      (message "obaq-mode: formatter not executable, skipped: %s" command)
      (cl-return-from obaq-mode--format-block nil))
    (let ((process-environment (append (list (concat "CODE_FENCE=" fence-line)
                                             (concat "CODE_LANGUAGE=" lang))
                                       process-environment)))
      (with-temp-buffer
        (let ((output-buffer (current-buffer)))
          (with-temp-buffer
            (insert content)
            (let ((exit-code
                   (call-process-region
                    (point-min)
                    (point-max)
                    command
                    nil
                    (list output-buffer t)
                    nil)))
              (with-current-buffer output-buffer
                (if (and (numberp exit-code) (zerop exit-code))
                    (buffer-string)
                  (error "Formatter failed: %s" (string-trim (buffer-string))))))))))))

(defun obaq-mode--render-block (block)
  "Render BLOCK by invoking the obaq CLI."
  (let* ((content (plist-get block :content))
         (temp-file (make-temp-file "obaq" nil ".base"))
         (command (obaq-mode--resolve-command))
         (title-width (if (bound-and-true-p obaq-view-mode) "title" "markup"))
         (vault obsidian-directory)
         (buffer-path (obaq-mode--buffer-path))
         (default-directory (file-name-directory buffer-path)))
    (unwind-protect
        (progn
          (with-temp-file temp-file
            (insert content))
          (with-temp-buffer
            (let ((exit-code
                   (process-file
                    command
                    nil
                    (list (current-buffer) t)
                    nil
                    "-d"
                    vault
                    "-e"
                    (concat "@" temp-file)
                    "-f"
                    obaq-mode-format
                    "--title-width"
                    title-width
                    "--this"
                    buffer-path)))
              (if (and (numberp exit-code) (zerop exit-code))
                  (buffer-string)
                (error "Obaq failed: %s" (string-trim (buffer-string)))))))
      (ignore-errors (delete-file temp-file)))))

(defun obaq-mode--with-silent-modifications (fn)
  "Run FN without marking the buffer as modified."
  (let ((inhibit-read-only t)
        (was-read-only buffer-read-only)
        (inhibit-modification-hooks t)
        (buffer-undo-list t)
        (was-modified (buffer-modified-p)))
    (unwind-protect
        (progn
          (setq buffer-read-only nil)
          (funcall fn)
          (set-buffer-modified-p was-modified))
      (setq buffer-read-only was-read-only)
      (set-buffer-modified-p was-modified))))

(defun obaq-mode--rendered-region-at-point ()
  "Return rendered region info at point, or nil."
  (let ((pos (point)))
    (when (get-text-property pos 'obaq-rendered)
      (if-let ((region (get-text-property pos 'obaq-region)))
          (list :start (car region)
                :end (cdr region)
                :raw (get-text-property pos 'obaq-original))
        (let ((start (or (previous-single-property-change
                          pos 'obaq-rendered nil (point-min))
                         (point-min)))
              (end (or (next-single-property-change
                        pos 'obaq-rendered nil (point-max))
                       (point-max))))
          (list :start start
                :end end
                :raw (get-text-property pos 'obaq-original)))))))

(defun obaq-mode--rendered-regions ()
  "Return a list of rendered region plists."
  (let ((pos (point-min))
        regions)
    (while (< pos (point-max))
      (let ((next (next-single-property-change
                   pos 'obaq-rendered nil (point-max))))
        (when (get-text-property pos 'obaq-rendered)
          (let* ((region (get-text-property pos 'obaq-region))
                 (start (if region (car region) pos))
                 (end (if region (cdr region) (or next (point-max)))))
            (push (list :start start
                        :end end
                        :raw (get-text-property pos 'obaq-original))
                  regions)))
        (setq pos (or next (point-max)))))
    (nreverse regions)))

(defun obaq-mode--apply-rendered (block rendered)
  "Replace BLOCK with RENDERED and add read-only properties."
  (obaq-mode--with-silent-modifications
   (lambda ()
     (save-excursion
       (goto-char (plist-get block :start))
       (delete-region (plist-get block :start)
                      (plist-get block :end))
       (let ((insert-start (point)))
         (insert rendered)
         (let ((insert-end (point))
               (raw (plist-get block :raw)))
           (add-text-properties
            insert-start
            insert-end
            `(obaq-rendered t
                            obaq-original ,raw
                            obaq-region ,(cons insert-start insert-end)
                            read-only t
                            front-sticky (read-only obaq-rendered obaq-original obaq-region)
                            rear-nonsticky (read-only obaq-rendered obaq-original obaq-region)))
           (list :start insert-start :end insert-end)))))))

(defun obaq-mode--restore-region (region)
  "Restore REGION to its original base block content."
  (let ((raw (plist-get region :raw)))
    (unless raw
      (error "Missing original base block contents"))
    (obaq-mode--with-silent-modifications
     (lambda ()
       (save-excursion
         (goto-char (plist-get region :start))
         (delete-region (plist-get region :start)
                        (plist-get region :end))
         (insert raw))))))

;;;###autoload
(defun obaq-mode-restore-all ()
  "Restore all rendered base blocks in the current buffer."
  (interactive)
  (let ((regions (obaq-mode--rendered-regions)))
    (when regions
      (dolist (region (reverse regions))
        (obaq-mode--restore-region region)))))

(defun obaq-mode--render-all ()
  "Render all base blocks in the current buffer."
  (let ((blocks (obaq-mode--base-blocks))
        (formatter-blocks (when (and obaq-view-mode
                                     obaq-enable-code-block-formatter-p)
                            (obaq-mode--formatter-blocks))))
    (when (or blocks formatter-blocks)
      (dolist (block (sort (append blocks formatter-blocks)
                           (lambda (left right)
                             (> (plist-get left :start)
                                (plist-get right :start)))))
        (if (plist-get block :formatter)
            (let ((rendered (obaq-mode--format-block block)))
              (when rendered
                (obaq-mode--apply-rendered block rendered)))
          (obaq-mode--apply-rendered
           block
           (obaq-mode--render-block block)))))))

;;;###autoload
(defun obaq-mode-renderable-blocks-exist-p ()
  "Return non-nil if the current buffer has renderable blocks."
  (or (and (obaq-mode--base-blocks) t)
      (and obaq-enable-code-block-formatter-p
           (obaq-mode--formatter-blocks)
           t)))

;;;###autoload
(defun obaq-mode-toggle-block ()
  "Toggle the base block at point."
  (interactive)
  (let ((rendered (obaq-mode--rendered-region-at-point)))
    (if rendered
        (obaq-mode--restore-region rendered)
      (let ((block (obaq-mode--block-at-point)))
        (unless block
          (user-error "No base block at point"))
        (obaq-mode--apply-rendered block (obaq-mode--render-block block))))))

;;;###autoload
(defun obaq-mode-toggle-all ()
  "Toggle all base blocks in the current buffer."
  (interactive)
  (let ((rendered (obaq-mode--rendered-regions)))
    (if rendered
        (obaq-mode-restore-all)
      (let ((blocks (obaq-mode--base-blocks)))
        (unless blocks
          (user-error "No base blocks found"))
        (dolist (block (reverse blocks))
          (obaq-mode--apply-rendered block
                                     (obaq-mode--render-block block)))))))

(defvar obaq-buffer-mode-map
  (let ((map (make-sparse-keymap)))
    (define-key map (kbd "C-c C-q v") #'obaq-view-enter)
    (define-key map (kbd "C-c C-q t") #'obaq-mode-toggle-block)
    (define-key map (kbd "C-c C-q a") #'obaq-mode-toggle-all)
    (define-key map (kbd "C-c C-q c") #'obaq-mode-restore-all)
    (define-key map (kbd "C-c C-q q") #'obaq-buffer-mode)
    map)
  "Keymap for obaq-buffer-mode.")

(defvar obaq-view-mode-map
  (let ((map (make-sparse-keymap)))
    (define-key map (kbd "RET") #'obsidian-follow-link-at-point)
    (define-key map (kbd "TAB") #'markdown-next-link)
    (define-key map (kbd "<backtab>") #'markdown-previous-link)
    (define-key map (kbd "q") #'obaq-view-quit)
    map)
  "Keymap for obaq-view-mode.")

(defvar-local obaq-view-mode--saved-minor-mode-map-alist nil)

(defun obaq-view-mode--prioritize-keymap ()
  "Move `obaq-view-mode' keymap to the front of `minor-mode-map-alist'."
  (setq-local obaq-view-mode--saved-minor-mode-map-alist
              minor-mode-map-alist)
  (let ((entry (assq 'obaq-view-mode minor-mode-map-alist)))
    (unless entry
      (setq entry (cons 'obaq-view-mode obaq-view-mode-map))
      (setq-local minor-mode-map-alist
                  (cons entry minor-mode-map-alist)))
    (setq-local minor-mode-map-alist
                (cons entry
                      (delq entry minor-mode-map-alist)))))

;;;###autoload
(define-minor-mode obaq-buffer-mode
  "Minor mode for obaq keybindings in gfm-mode buffers."
  :lighter " obaq"
  :keymap obaq-buffer-mode-map
  (when obaq-buffer-mode
    (when (and obaq-auto-view-enter-p
               (not obaq-mode--auto-view-entered-p)
               (obaq-mode-renderable-blocks-exist-p))
      (setq-local obaq-mode--auto-view-entered-p t)
      (obaq-view-enter))))

;;;###autoload
(define-minor-mode obaq-view-mode
  "Minor mode for navigation in gfm-view-mode."
  :lighter ""
  :keymap obaq-view-mode-map
  (if obaq-view-mode
      (condition-case error
          (progn
            (unless (derived-mode-p 'gfm-view-mode)
              (setq obaq-view-mode nil)
              (user-error "Obaq-view-mode requires gfm-view-mode"))
            (obaq-view-mode--prioritize-keymap)
            (obaq-mode--render-all))
        (error
         (when obaq-view-mode--saved-minor-mode-map-alist
           (setq-local minor-mode-map-alist
                       obaq-view-mode--saved-minor-mode-map-alist)
           (setq-local obaq-view-mode--saved-minor-mode-map-alist nil))
         (setq obaq-view-mode nil)
         (signal (car error) (cdr error))))
    (when obaq-view-mode--saved-minor-mode-map-alist
      (setq-local minor-mode-map-alist
                  obaq-view-mode--saved-minor-mode-map-alist)
      (setq-local obaq-view-mode--saved-minor-mode-map-alist nil))))

;;;###autoload
(defun obaq-view-enter ()
  "Enter gfm-view-mode and enable obaq-view-mode."
  (interactive)
  (unless (derived-mode-p 'gfm-mode)
    (user-error "Obaq-view-mode requires gfm-mode"))
  (when (fboundp 'gfm-view-mode)
    (gfm-view-mode))
  (obaq-view-mode 1))

;;;###autoload
(defun obaq-view-quit ()
  "Exit obaq-view-mode, restore blocks, and switch back to gfm-mode."
  (interactive)
  (obaq-view-mode -1)
  (obaq-mode-restore-all)
  (when (fboundp 'gfm-mode)
    (gfm-mode)))

(defun obaq-mode-disable-on-major-change ()
  "Disable obaq buffer/view modes before changing major modes."
  (when obaq-buffer-mode
    (obaq-buffer-mode -1))
  (when obaq-view-mode
    (obaq-view-mode -1)))

;;;###autoload
(define-minor-mode obaq-mode
  "Toggle obaq-mode integration for obsidian/gfm buffers globally."
  :global t
  :group 'obaq
  (if obaq-mode
      (progn
        (add-hook 'obsidian-mode-hook #'obaq-buffer-mode)
        (add-hook 'change-major-mode-hook #'obaq-mode-disable-on-major-change))
    (remove-hook 'obsidian-mode-hook #'obaq-buffer-mode)
    (remove-hook 'change-major-mode-hook #'obaq-mode-disable-on-major-change)))

(provide 'obaq-mode)
;;; obaq-mode.el ends here
