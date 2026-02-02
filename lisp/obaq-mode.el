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
;; Version: 0.2.2
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

(defcustom obaq-auto-replace-all-p nil
  "Automatically replace all blocks when entering `obaq-buffer-mode'.
When non-nil, enabling `obaq-buffer-mode' will automatically call
`obaq-mode-replace-all' if the buffer contains renderable blocks.
Auto-replace runs once per buffer, even across major mode changes."
  :type 'boolean
  :group 'obaq)

(defface obaq-rendered-block
  '((((background light)) :background "#f0f8ff" :extend t)
    (((background dark)) :background "#1a2a3a" :extend t))
  "Face for rendered obaq blocks.
Use this to set a background color or other visual distinction
for rendered content."
  :group 'obaq)

(defvar obaq-view-mode)
(put 'obaq-view-mode 'permanent-local t)
(defvar-local obaq-mode--auto-replaced-p nil)
(put 'obaq-mode--auto-replaced-p 'permanent-local t)
(defvar-local obaq-mode--reentering-major-mode nil
  "Non-nil while re-entering major mode for display refresh.")
(put 'obaq-mode--reentering-major-mode 'permanent-local t)
(defvar-local obaq-mode--saving-buffer nil
  "Non-nil while saving buffer with rendered blocks.")
(put 'obaq-mode--saving-buffer 'permanent-local t)
(defvar-local obaq-mode--switching-view-mode nil
  "Non-nil while switching between gfm-mode and gfm-view-mode.")
(put 'obaq-mode--switching-view-mode 'permanent-local t)
(defvar-local obaq-mode--saved-revert-buffer-function nil
  "Saved `revert-buffer-function' before obaq-buffer-mode set it.")
(put 'obaq-mode--saved-revert-buffer-function 'permanent-local t)
(defvar-local obaq-view-mode--rendering-as-view nil
  "Non-nil when rendering should include formatter blocks.")

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
                       (block-end (match-end 0)))
                  (push (list :start block-start
                              :end block-end
                              :content (buffer-substring-no-properties
                                        content-start content-end)
                              :raw (buffer-substring-no-properties
                                    block-start block-end))
                        blocks))
              (goto-char (point-max))))))
      (nreverse blocks))))

(defun obaq-mode--formatter-info (line)
  "Return formatter info plist from a code fence LINE, or nil."
  (save-match-data
    (and (string-match "^```[ \t]*\\([^ \t\n]*\\)\\(.*\\)$" line)
         (let ((lang (match-string 1 line))
               (attrs (match-string 2 line)))
           (and (not (string-empty-p lang))
                (not (string= lang "base"))
                (string-match "\\bformatter=\\([A-Za-z0-9_.-]+\\)\\b" attrs)
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
                      (line-end-position))))
          (when-let* ((info (obaq-mode--formatter-info line)))
            (forward-line 1)
            (let ((content-start (point)))
              (if (re-search-forward "^```[ \t]*$" nil t)
                  (let* ((content-end (match-beginning 0))
                         (block-end (match-end 0)))
                    (push (list :start block-start
                                :end block-end
                                :content (buffer-substring-no-properties
                                          content-start content-end)
                                :raw (buffer-substring-no-properties
                                      block-start block-end)
                                :formatter (plist-get info :formatter)
                                :fence-line (plist-get info :fence)
                                :lang (plist-get info :lang))
                          blocks))
                (goto-char (point-max)))))))
      (nreverse blocks))))

(defun obaq-mode--block-at-point-in (blocks)
  "Return the block at point from BLOCKS, or nil."
  (let ((pos (point)))
    (cl-find-if (lambda (block)
                  (and (<= (plist-get block :start) pos)
                       (<= pos (plist-get block :end))))
                blocks)))

(defun obaq-mode--block-at-point ()
  "Return the base block plist at point, or nil."
  (obaq-mode--block-at-point-in (obaq-mode--base-blocks)))

(defun obaq-mode--formatter-block-at-point ()
  "Return the formatter block plist at point, or nil."
  (obaq-mode--block-at-point-in (obaq-mode--formatter-blocks)))

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
                   (call-process-region (point-min) (point-max) command
                                        nil (list output-buffer t) nil)))
              (with-current-buffer output-buffer
                (if (eql exit-code 0)
                    (buffer-string)
                  (error "Formatter failed: %s" (string-trim (buffer-string))))))))))))

(defun obaq-mode--render-block (block)
  "Render BLOCK by invoking the obaq CLI."
  (let* ((content (plist-get block :content))
         (temp-file (make-temp-file "obaq" nil ".base"))
         (command (obaq-mode--resolve-command))
         (title-width (if (obaq-mode--rendering-as-view-p) "title" "markup"))
         (vault obsidian-directory)
         (buffer-path (obaq-mode--buffer-path))
         (default-directory (file-name-directory buffer-path)))
    (unwind-protect
        (progn
          (with-temp-file temp-file
            (insert content))
          (with-temp-buffer
            (let ((exit-code
                   (process-file command nil (list (current-buffer) t) nil
                                 "-d" vault
                                 "-e" (concat "@" temp-file)
                                 "-f" obaq-mode-format
                                 "--title-width" title-width
                                 "--this" buffer-path)))
              (if (eql exit-code 0)
                  (buffer-string)
                (error "Obaq failed: %s" (string-trim (buffer-string)))))))
      (ignore-errors (delete-file temp-file)))))

(defun obaq-mode--with-silent-modifications (fn)
  "Run FN without marking the buffer as modified."
  (let ((inhibit-read-only t)
        (was-read-only buffer-read-only)
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
    (and (get-text-property pos 'obaq-rendered)
         (let ((start (or (previous-single-property-change
                           pos 'obaq-rendered nil (point-min))
                          (point-min))))
           (unless (get-text-property start 'obaq-rendered)
             (setq start pos))
           (list :start start
                 :end (or (next-single-property-change
                           pos 'obaq-rendered nil (point-max))
                          (point-max))
                 :raw (get-text-property pos 'obaq-original))))))

(defun obaq-mode--rendered-regions ()
  "Return a list of rendered region plists with current buffer positions."
  (let ((pos (point-min))
        regions)
    (while (< pos (point-max))
      (let ((next (next-single-property-change
                   pos 'obaq-rendered nil (point-max))))
        (when (get-text-property pos 'obaq-rendered)
          (push (list :start pos
                      :end (or next (point-max))
                      :raw (get-text-property pos 'obaq-original))
                regions))
        (setq pos (or next (point-max)))))
    (nreverse regions)))

(defun obaq-mode--apply-rendered (block rendered)
  "Replace BLOCK with RENDERED and add read-only properties."
  (obaq-mode--with-silent-modifications
   (lambda ()
     (save-excursion
       (let ((start (plist-get block :start)))
         (goto-char start)
         (delete-region start (plist-get block :end))
         (insert rendered)
         (let* ((end (point))
                (ov (make-overlay start end nil t nil)))
           (add-text-properties
            start end
            `(obaq-rendered t
                            obaq-original ,(plist-get block :raw)
                            read-only t
                            front-sticky (read-only obaq-rendered obaq-original)
                            rear-nonsticky t))
           (overlay-put ov 'obaq-rendered t)
           (overlay-put ov 'face 'obaq-rendered-block)
           ;; Hide the trailing newline after rendered block if present
           ;; Use modification-hooks to prevent deletion
           (when (and (< end (point-max)) (eq (char-after end) ?\n))
             (let ((nl-ov (make-overlay end (1+ end) nil nil nil)))
               (overlay-put nl-ov 'obaq-rendered-newline t)
               (overlay-put nl-ov 'display "")
               (overlay-put nl-ov 'modification-hooks
                            (list (lambda (ov after-p beg end &optional len)
                                    (unless after-p
                                      (signal 'text-read-only nil)))))))
           (obaq-mode--refresh-display start end)
           (list :start start :end end)))))))

(defun obaq-mode--fontify-region (start end)
  "Fontify region between START and END for markdown decorations."
  (when (and (derived-mode-p 'markdown-mode)
             (bound-and-true-p font-lock-mode))
    (let ((inhibit-read-only t)
          (end (min end (point-max))))
      (font-lock-flush start end)
      (font-lock-ensure start end))))

(defun obaq-mode--refresh-display (start end)
  "Refresh display after modifying region between START and END.
In view modes, re-enters the major mode.  Otherwise, fontifies the region."
  (if (and (derived-mode-p '(markdown-view-mode gfm-view-mode))
           (not obaq-mode--reentering-major-mode))
      (let ((pos (point))
            (win (selected-window))
            (start-pos (window-start))
            (mode major-mode)
            (was-obaq-view-mode obaq-view-mode))
        (setq obaq-mode--reentering-major-mode t)
        (unwind-protect
            (progn
              (funcall mode)
              (goto-char (min pos (point-max)))
              (when (window-live-p win)
                (set-window-start win start-pos t))
              (when was-obaq-view-mode
                (obaq-view-mode 1)))
          (setq obaq-mode--reentering-major-mode nil)))
    (obaq-mode--fontify-region start end)))

(defun obaq-mode--restore-region (region)
  "Restore REGION to its original base block content."
  (let ((raw (plist-get region :raw))
        (start (plist-get region :start))
        (end (plist-get region :end)))
    (unless raw
      (error "Missing original base block contents"))
    ;; Delete block overlay and trailing newline overlay
    (dolist (ov (overlays-in start (min (1+ end) (point-max))))
      (when (or (overlay-get ov 'obaq-rendered)
                (overlay-get ov 'obaq-rendered-newline))
        (delete-overlay ov)))
    (obaq-mode--with-silent-modifications
     (lambda ()
       (save-excursion
         (goto-char start)
         (delete-region start end)
         (insert raw)
         (obaq-mode--refresh-display start (point)))))))

(defun obaq-mode--raw-base-block-p (raw)
  "Return non-nil if RAW starts with a base code fence."
  (and raw (string-match-p "^```[ \t]*base\\b" raw)))

(defun obaq-mode--raw-formatter-block-p (raw)
  "Return non-nil if RAW starts with a formatter code fence."
  (and raw
       (obaq-mode--formatter-info (car (split-string raw "\n")))
       t))

(defun obaq-mode--write-contents ()
  "Restore rendered blocks before saving, then revert to re-render.
This function is added to `write-contents-functions'."
  (let* ((was-view-mode (or obaq-view-mode
                            (derived-mode-p 'gfm-view-mode 'markdown-view-mode)))
         (regions (obaq-mode--rendered-regions))
         (had-formatter-blocks
          (cl-some (lambda (r)
                     (obaq-mode--raw-formatter-block-p (plist-get r :raw)))
                   regions)))
    (when (and (not obaq-mode--saving-buffer) regions)
      (setq obaq-mode--saving-buffer t)
      (unwind-protect
          (progn
            (obaq-mode-restore-all)
            (save-buffer)
            (setq obaq-mode--switching-view-mode t)
            (unwind-protect
                (let ((revert-buffer-function nil))
                  (revert-buffer t t))
              (setq obaq-mode--switching-view-mode nil))
            (if was-view-mode
                (obaq-view-enter)
              (setq obaq-view-mode--rendering-as-view had-formatter-blocks)
              (unwind-protect
                  (obaq-mode--render-all)
                (setq obaq-view-mode--rendering-as-view nil))))
        (setq obaq-mode--saving-buffer nil))
      t)))

;;;###autoload
(defun obaq-mode-restore-all ()
  "Restore all rendered base blocks in the current buffer."
  (interactive)
  (when-let* ((regions (obaq-mode--rendered-regions)))
    (dolist (region (reverse regions))
      (obaq-mode--restore-region region))))

(defun obaq-mode--render-block-auto (block)
  "Render BLOCK using the appropriate renderer and apply the result.
For formatter blocks, apply only if rendering succeeds."
  (if (plist-get block :formatter)
      (when-let* ((rendered (obaq-mode--format-block block)))
        (obaq-mode--apply-rendered block rendered))
    (obaq-mode--apply-rendered block (obaq-mode--render-block block))))

(defun obaq-mode--all-renderable-blocks ()
  "Return all renderable blocks sorted by position descending."
  (let ((blocks (obaq-mode--base-blocks))
        (formatter-blocks (and obaq-enable-code-block-formatter-p
                               (obaq-mode--formatter-blocks))))
    (sort (append blocks formatter-blocks)
          (lambda (left right)
            (> (plist-get left :start)
               (plist-get right :start))))))

(defun obaq-mode--render-all ()
  "Render all base blocks in the current buffer."
  (dolist (block (obaq-mode--all-renderable-blocks))
    (obaq-mode--render-block-auto block)))

;;;###autoload
(defun obaq-mode-renderable-blocks-exist-p ()
  "Return non-nil if the current buffer has renderable blocks."
  (and (or (obaq-mode--base-blocks)
           (and obaq-enable-code-block-formatter-p
                (obaq-mode--formatter-blocks)))
       t))

(defun obaq-mode--renderable-block-at-point ()
  "Return the renderable block (base or formatter) at point, or nil."
  (or (obaq-mode--block-at-point)
      (and obaq-enable-code-block-formatter-p
           (obaq-mode--formatter-block-at-point))))

;;;###autoload
(defun obaq-mode-toggle-block (&optional all)
  "Toggle the block at point.
With prefix argument ALL, toggle all blocks in the buffer."
  (interactive "P")
  (if all
      (obaq-mode-toggle-all)
    (cond
     ((when-let* ((rendered (obaq-mode--rendered-region-at-point)))
        (obaq-mode--restore-region rendered)
        t))
     ((when-let* ((block (obaq-mode--renderable-block-at-point)))
        (obaq-mode--render-block-auto block)
        t))
     (t (user-error "No base or formatter block at point")))))

;;;###autoload
(defun obaq-mode-restore-block (&optional all)
  "Restore the rendered block at point.
With prefix argument ALL, restore all rendered blocks in the buffer."
  (interactive "P")
  (if all
      (obaq-mode-restore-all)
    (if-let* ((rendered (obaq-mode--rendered-region-at-point)))
        (obaq-mode--restore-region rendered)
      (user-error "No rendered block at point"))))

;;;###autoload
(defun obaq-mode-refresh-block (&optional all)
  "Refresh the block at point.
With prefix argument ALL, refresh all blocks in the buffer."
  (interactive "P")
  (if all
      (obaq-mode-refresh-all)
    (cond
     ((when-let* ((rendered (obaq-mode--rendered-region-at-point)))
        (let ((start (plist-get rendered :start)))
          (obaq-mode--restore-region rendered)
          (save-excursion
            (goto-char start)
            (if-let* ((block (obaq-mode--renderable-block-at-point)))
                (obaq-mode--render-block-auto block)
              (user-error "No base or formatter block at point"))))
        t))
     ((when-let* ((block (obaq-mode--renderable-block-at-point)))
        (obaq-mode--render-block-auto block)
        t))
     (t (user-error "No base or formatter block at point")))))

;;;###autoload
(defun obaq-mode-toggle-all ()
  "Toggle all renderable blocks in the current buffer.
If all blocks are replaced, restore all.  Otherwise, replace all."
  (interactive)
  (if (obaq-mode--all-renderable-blocks)
      (obaq-mode-replace-all)
    (obaq-mode-restore-all)))

;;;###autoload
(defun obaq-mode-replace-all ()
  "Replace all renderable blocks in the current buffer."
  (interactive)
  (if-let* ((blocks (obaq-mode--all-renderable-blocks)))
      (dolist (block blocks)
        (obaq-mode--render-block-auto block))
    (user-error "No renderable blocks found")))

;;;###autoload
(defun obaq-mode-refresh-all ()
  "Refresh all renderable blocks in the current buffer."
  (interactive)
  (let* ((regions (obaq-mode--rendered-regions))
         (base-regions (cl-remove-if-not
                        (lambda (region)
                          (obaq-mode--raw-base-block-p (plist-get region :raw)))
                        regions)))
    (cond
     ((obaq-mode--rendering-as-view-p)
      (save-excursion
        (obaq-mode-restore-all)
        (obaq-mode--render-all)
        (obaq-mode--refresh-display (point-min) (point-max))))
     (base-regions
      (save-excursion
        (dolist (region (reverse base-regions))
          (let ((start (plist-get region :start)))
            (obaq-mode--restore-region region)
            (goto-char start)
            (when-let* ((block (obaq-mode--block-at-point)))
              (obaq-mode--apply-rendered block (obaq-mode--render-block block)))))
        (obaq-mode--refresh-display (point-min) (point-max))))
     (regions
      (obaq-mode--refresh-display (point-min) (point-max))
      (message "No base blocks to refresh in non-view mode"))
     ((obaq-mode--base-blocks)
      (save-excursion
        (obaq-mode--render-all)
        (obaq-mode--refresh-display (point-min) (point-max))))
     (t (user-error "No renderable blocks found")))))

(defvar obaq-buffer-mode-map
  (let ((map (make-sparse-keymap)))
    (define-key map (kbd "C-c C-q v") #'obaq-view-enter)
    (define-key map (kbd "C-c C-q t") #'obaq-mode-toggle-block)
    (define-key map (kbd "C-c C-q r") #'obaq-mode-refresh-block)
    (define-key map (kbd "C-c C-q u") #'obaq-mode-restore-block)
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

(defun obaq-mode--rendering-as-view-p ()
  "Return non-nil when rendering should use view-mode settings."
  (or obaq-view-mode obaq-view-mode--rendering-as-view))

(defun obaq-view-mode--prioritize-keymap ()
  "Move `obaq-view-mode' keymap to the front of `minor-mode-map-alist'."
  (setq-local obaq-view-mode--saved-minor-mode-map-alist
              minor-mode-map-alist
              minor-mode-map-alist
              (cons (or (assq 'obaq-view-mode minor-mode-map-alist)
                        (cons 'obaq-view-mode obaq-view-mode-map))
                    (assq-delete-all 'obaq-view-mode minor-mode-map-alist))))

(defun obaq-mode--revert-buffer (&rest args)
  "Revert buffer preserving obaq-buffer-mode state.
This function is used for `revert-buffer-function' in `obaq-buffer-mode'."
  (let ((revert-buffer-function obaq-mode--saved-revert-buffer-function)
        (func (or obaq-mode--saved-revert-buffer-function
                  #'revert-buffer--default)))
    (setq obaq-mode--switching-view-mode t)
    (unwind-protect
        (apply func args)
      (setq obaq-mode--switching-view-mode nil))))

(defun obaq-view-mode--revert-buffer (&rest args)
  "Revert buffer and re-enter view mode automatically."
  (setq obaq-mode--switching-view-mode t)
  (unwind-protect
      (progn
        (let ((revert-buffer-function nil))
          (apply #'revert-buffer args))
        (obaq-view-enter))
    (setq obaq-mode--switching-view-mode nil)))

;;;###autoload
(define-minor-mode obaq-buffer-mode
  "Minor mode for obaq keybindings in gfm-mode buffers."
  :lighter " obaq"
  :keymap obaq-buffer-mode-map
  (if obaq-buffer-mode
      (progn
        (add-hook 'write-contents-functions #'obaq-mode--write-contents nil t)
        (unless (eq revert-buffer-function #'obaq-mode--revert-buffer)
          (setq-local obaq-mode--saved-revert-buffer-function
                      revert-buffer-function
                      revert-buffer-function
                      #'obaq-mode--revert-buffer))
        (when (and obaq-auto-replace-all-p
                   (not obaq-mode--auto-replaced-p)
                   (not obaq-mode--saving-buffer)
                   (obaq-mode-renderable-blocks-exist-p))
          (setq-local obaq-mode--auto-replaced-p t)
          (obaq-mode-replace-all)))
    (remove-hook 'write-contents-functions #'obaq-mode--write-contents t)
    (setq-local revert-buffer-function
                obaq-mode--saved-revert-buffer-function
                obaq-mode--saved-revert-buffer-function nil)))

;;;###autoload
(define-minor-mode obaq-view-mode
  "Minor mode for navigation in gfm-view-mode."
  :lighter ""
  :keymap obaq-view-mode-map
  (if obaq-view-mode
      (condition-case error
          (let ((needs-view-switch
                 (cond
                  ((derived-mode-p 'gfm-view-mode) nil)
                  ((derived-mode-p 'gfm-mode) t)
                  (t
                   (setq obaq-view-mode nil)
                   (user-error "Obaq-view-mode requires gfm-mode or gfm-view-mode")))))
            (obaq-view-mode--prioritize-keymap)
            (setq-local revert-buffer-function #'obaq-view-mode--revert-buffer)
            (let ((obaq-view-mode--rendering-as-view needs-view-switch))
              (when (not obaq-mode--reentering-major-mode)
                (obaq-mode--render-all)))
            (when needs-view-switch
              (setq obaq-mode--switching-view-mode t)
              (unwind-protect
                  (gfm-view-mode)
                (setq obaq-mode--switching-view-mode nil))
              (obaq-view-mode 1)))
        (error
         (setq-local revert-buffer-function #'obaq-mode--revert-buffer)
         (when obaq-view-mode--saved-minor-mode-map-alist
           (setq-local minor-mode-map-alist
                       obaq-view-mode--saved-minor-mode-map-alist
                       obaq-view-mode--saved-minor-mode-map-alist nil))
         (setq obaq-view-mode nil)
         (signal (car error) (cdr error))))
    (when obaq-view-mode--saved-minor-mode-map-alist
      (setq-local minor-mode-map-alist
                  obaq-view-mode--saved-minor-mode-map-alist
                  obaq-view-mode--saved-minor-mode-map-alist nil))
    (setq-local revert-buffer-function #'obaq-mode--revert-buffer)))

;;;###autoload
(defun obaq-view-enter ()
  "Enter gfm-view-mode and enable obaq-view-mode."
  (interactive)
  (unless (derived-mode-p 'gfm-mode)
    (user-error "Obaq-view-mode requires gfm-mode"))
  (obaq-view-mode 1))

;;;###autoload
(defun obaq-view-quit ()
  "Exit obaq-view-mode, restore blocks, and switch back to gfm-mode."
  (interactive)
  (obaq-view-mode -1)
  (obaq-mode-restore-all)
  (setq obaq-mode--switching-view-mode t)
  (unwind-protect
      (when (fboundp 'gfm-mode)
        (gfm-mode))
    (setq obaq-mode--switching-view-mode nil)))

(defun obaq-mode-disable-on-major-change ()
  "Disable obaq buffer/view modes before changing major modes."
  (unless obaq-mode--switching-view-mode
    (when obaq-buffer-mode
      (obaq-mode-restore-all)
      (obaq-buffer-mode -1))
    (when obaq-view-mode
      (obaq-view-mode -1))))

;;;###autoload
(define-minor-mode obaq-mode
  "Toggle obaq-mode integration for obsidian/gfm buffers globally."
  :global t
  :group 'obaq
  (cond
   (obaq-mode
    (add-hook 'obsidian-mode-hook #'obaq-buffer-mode)
    (add-hook 'change-major-mode-hook #'obaq-mode-disable-on-major-change))
   (t
    (remove-hook 'obsidian-mode-hook #'obaq-buffer-mode)
    (remove-hook 'change-major-mode-hook #'obaq-mode-disable-on-major-change))))

(provide 'obaq-mode)
;;; obaq-mode.el ends here
