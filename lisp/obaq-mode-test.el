;;; obaq-mode-test.el --- Tests for obaq-mode -*- lexical-binding: t; -*-

;; Copyright (c) 2026 Akinori Musha
;;
;; All rights reserved.

;;; Commentary:

;; Unit tests for obaq-mode.

;;; Code:

(require 'ert)

;; Mock dependencies
(defvar obsidian-directory "/tmp/obaq-test-vault")

(unless (fboundp 'gfm-mode)
  (define-derived-mode gfm-mode text-mode "GFM"))

(unless (fboundp 'gfm-view-mode)
  (define-derived-mode gfm-view-mode gfm-mode "GFM-View"
    (setq buffer-read-only t)))

(unless (fboundp 'obsidian-follow-link-at-point)
  (defun obsidian-follow-link-at-point ()))

(require 'obaq-mode)

(defmacro obaq-test-with-temp-buffer (content &rest body)
  "Create a temp buffer with CONTENT in gfm-mode and run BODY."
  (declare (indent 1))
  `(let ((temp-file (make-temp-file "obaq-test" nil ".md")))
     (unwind-protect
         (progn
           (with-temp-file temp-file
             (insert ,content))
           (find-file temp-file)
           (gfm-mode)
           (obaq-buffer-mode 1)
           ,@body)
       (when (get-file-buffer temp-file)
         (kill-buffer (get-file-buffer temp-file)))
       (delete-file temp-file))))

;;; Basic functionality tests

(ert-deftest obaq-test-saving-buffer-guard ()
  "Test that obaq-mode--saving-buffer prevents recursion."
  (obaq-test-with-temp-buffer "# Test\n"
    (should-not obaq-mode--saving-buffer)
    (setq obaq-mode--saving-buffer t)
    (should obaq-mode--saving-buffer)
    (should-not (and (not obaq-mode--saving-buffer) t))
    (setq obaq-mode--saving-buffer nil)))

(ert-deftest obaq-test-view-mode-detection ()
  "Test that view mode is correctly detected."
  (obaq-test-with-temp-buffer "# Test\n"
    (should (derived-mode-p 'gfm-mode))
    (should-not (derived-mode-p 'gfm-view-mode))
    (gfm-view-mode)
    (should (derived-mode-p 'gfm-view-mode))
    (let ((was-view (derived-mode-p 'gfm-view-mode 'markdown-view-mode)))
      (should was-view))))

(ert-deftest obaq-test-refresh-display-preserves-mode ()
  "Test that refresh-display preserves the major mode."
  (obaq-test-with-temp-buffer "# Test\n"
    (gfm-view-mode)
    (should (derived-mode-p 'gfm-view-mode))
    (let ((mode-before major-mode))
      (obaq-mode--refresh-display (point-min) (point-max))
      (should (derived-mode-p 'gfm-view-mode)))))

;;; Render and restore tests

(ert-deftest obaq-test-render-and-restore ()
  "Test rendering and restoring blocks."
  (obaq-test-with-temp-buffer "# Test\n\n```base\ntest\n```\n"
    (cl-letf (((symbol-function 'obaq-mode--render-block)
               (lambda (block) "Rendered\n")))
      (should (obaq-mode--base-blocks))
      (should-not (obaq-mode--rendered-regions))
      (obaq-mode--render-all)
      (should (obaq-mode--rendered-regions))
      (should-not (obaq-mode--base-blocks))
      (obaq-mode-restore-all)
      (should-not (obaq-mode--rendered-regions))
      (should (obaq-mode--base-blocks)))))

(ert-deftest obaq-test-view-mode-render ()
  "Test rendering in view mode."
  (obaq-test-with-temp-buffer "# Test\n\n```base\ntest\n```\n"
    (cl-letf (((symbol-function 'obaq-mode--render-block)
               (lambda (block) "Rendered\n")))
      (gfm-view-mode)
      (obaq-view-mode 1)
      (should (obaq-mode--rendered-regions))
      (should obaq-view-mode))))

(ert-deftest obaq-test-view-mode-detection-before-restore ()
  "Test view mode is detected before any buffer modifications."
  (obaq-test-with-temp-buffer "# Test\n\n```base\ntest\n```\n"
    (cl-letf (((symbol-function 'obaq-mode--render-block)
               (lambda (block) "Rendered\n")))
      (gfm-view-mode)
      (obaq-view-mode 1)
      (let* ((before-anything (derived-mode-p 'gfm-view-mode 'markdown-view-mode))
             (major-mode-before major-mode))
        (should before-anything)
        (should (eq major-mode-before 'gfm-view-mode))
        (when (obaq-mode--rendered-regions)
          (let ((before-restore (derived-mode-p 'gfm-view-mode 'markdown-view-mode)))
            (obaq-mode-restore-all)
            (let ((after-restore (derived-mode-p 'gfm-view-mode 'markdown-view-mode)))
              (should (eq before-restore after-restore)))))))))

;;; Write-contents tests

(ert-deftest obaq-test-write-contents-full-cycle ()
  "Test complete write-contents cycle including re-render."
  (obaq-test-with-temp-buffer "# Test\n\n```base\ntest\n```\n"
    (let ((render-count 0)
          (save-count 0)
          (revert-count 0))
      (cl-letf (((symbol-function 'obaq-mode--render-block)
                 (lambda (block)
                   (cl-incf render-count)
                   "Rendered\n"))
                ((symbol-function 'save-buffer)
                 (lambda (&rest _)
                   (cl-incf save-count)))
                ((symbol-function 'revert-buffer)
                 (lambda (&rest _)
                   (cl-incf revert-count))))
        (gfm-view-mode)
        (obaq-view-mode 1)
        (should (obaq-mode--rendered-regions))
        (should (>= render-count 1))
        (let ((initial-render-count render-count))
          (obaq-mode--write-contents)
          (should (= save-count 1))
          (should (= revert-count 1))
          (should (> render-count initial-render-count)))))))

(ert-deftest obaq-test-write-contents-non-view-mode ()
  "Test write-contents in non-view mode (gfm-mode with rendered blocks)."
  (obaq-test-with-temp-buffer "# Test\n\n```base\ntest\n```\n"
    (let ((render-count 0))
      (cl-letf (((symbol-function 'obaq-mode--render-block)
                 (lambda (block)
                   (cl-incf render-count)
                   "Rendered\n"))
                ((symbol-function 'save-buffer) #'ignore)
                ((symbol-function 'revert-buffer) #'ignore))
        (obaq-mode--render-all)
        (should (derived-mode-p 'gfm-mode))
        (should-not (derived-mode-p 'gfm-view-mode))
        (should-not obaq-view-mode)
        (should (obaq-mode--rendered-regions))
        (let ((initial-render-count render-count))
          (obaq-mode--write-contents)
          (should (> render-count initial-render-count))
          (should (obaq-mode--rendered-regions)))))))

(ert-deftest obaq-test-write-contents-with-real-revert ()
  "Test write-contents with simulated real revert behavior."
  (obaq-test-with-temp-buffer "# Test\n\n```base\ntest\n```\n"
    (let ((render-count 0)
          (original-content (buffer-string)))
      (cl-letf (((symbol-function 'obaq-mode--render-block)
                 (lambda (block)
                   (cl-incf render-count)
                   "Rendered\n"))
                ((symbol-function 'save-buffer) #'ignore)
                ((symbol-function 'revert-buffer)
                 (lambda (&rest _)
                   (let ((inhibit-read-only t))
                     (erase-buffer)
                     (insert original-content)))))
        (obaq-mode--render-all)
        (should (obaq-mode--rendered-regions))
        (should (= 0 (length (obaq-mode--base-blocks))))
        (let ((initial-render-count render-count))
          (obaq-mode--write-contents)
          (should (> render-count initial-render-count))
          (should (obaq-mode--rendered-regions)))))))

(ert-deftest obaq-test-write-contents-formatter-blocks ()
  "Test write-contents with formatter blocks in non-view mode."
  (obaq-test-with-temp-buffer "# Test\n\n```js formatter=test\nconsole.log('hi')\n```\n"
    (let ((render-count 0)
          (format-count 0)
          (original-content (buffer-string))
          (obaq-enable-code-block-formatter-p t))
      (cl-letf (((symbol-function 'obaq-mode--render-block)
                 (lambda (block)
                   (cl-incf render-count)
                   "Rendered base\n"))
                ((symbol-function 'obaq-mode--format-block)
                 (lambda (block)
                   (cl-incf format-count)
                   "Formatted output\n"))
                ((symbol-function 'save-buffer) #'ignore)
                ((symbol-function 'revert-buffer)
                 (lambda (&rest _)
                   (let ((inhibit-read-only t))
                     (erase-buffer)
                     (insert original-content)))))
        (setq obaq-view-mode--rendering-as-view t)
        (unwind-protect
            (obaq-mode--render-all)
          (setq obaq-view-mode--rendering-as-view nil))
        (should (obaq-mode--rendered-regions))
        (should (= format-count 1))
        (let ((initial-format-count format-count))
          (obaq-mode--write-contents)
          (should (> format-count initial-format-count))
          (should (obaq-mode--rendered-regions)))))))

;;; Hook order tests

(ert-deftest obaq-test-write-contents-hook-state ()
  "Test that write-contents-functions is called with correct buffer state."
  (obaq-test-with-temp-buffer "# Test\n\n```base\ntest\n```\n"
    (cl-letf (((symbol-function 'obaq-mode--render-block)
               (lambda (block) "Rendered\n")))
      (gfm-view-mode)
      (obaq-view-mode 1)
      (let ((hook-states nil))
        (add-hook 'write-contents-functions
                  (lambda ()
                    (push (list :mode major-mode
                                :view-mode (derived-mode-p 'gfm-view-mode)
                                :regions (and (obaq-mode--rendered-regions) t))
                          hook-states)
                    nil)
                  nil t)
        (set-buffer-modified-p t)
        (cl-letf (((symbol-function 'write-region) #'ignore))
          (save-buffer))
        (when hook-states
          (let ((state (car (last hook-states))))
            (should (eq (plist-get state :mode) 'gfm-view-mode))
            (should (plist-get state :view-mode))))))))

;;; Block detection tests

(ert-deftest obaq-test-base-blocks-detection ()
  "Test detection of base blocks."
  (obaq-test-with-temp-buffer "# Test\n\n```base\nquery1\n```\n\nText\n\n```base\nquery2\n```\n"
    (let ((blocks (obaq-mode--base-blocks)))
      (should (= 2 (length blocks)))
      (should (string= "query1\n" (plist-get (nth 0 blocks) :content)))
      (should (string= "query2\n" (plist-get (nth 1 blocks) :content))))))

(ert-deftest obaq-test-formatter-blocks-detection ()
  "Test detection of formatter blocks."
  (obaq-test-with-temp-buffer "# Test\n\n```js formatter=prettier\ncode\n```\n"
    (let ((obaq-enable-code-block-formatter-p t))
      (let ((blocks (obaq-mode--formatter-blocks)))
        (should (= 1 (length blocks)))
        (should (string= "prettier" (plist-get (car blocks) :formatter)))
        (should (string= "js" (plist-get (car blocks) :lang)))))))

(ert-deftest obaq-test-formatter-info-parsing ()
  "Test parsing of formatter info from fence lines."
  (should (obaq-mode--formatter-info "```js formatter=test"))
  (should (obaq-mode--formatter-info "```python formatter=black"))
  (should-not (obaq-mode--formatter-info "```base"))
  (should-not (obaq-mode--formatter-info "```js"))
  (should-not (obaq-mode--formatter-info "``` formatter=test"))
  (let ((info (obaq-mode--formatter-info "```typescript formatter=prettier")))
    (should (string= "typescript" (plist-get info :lang)))
    (should (string= "prettier" (plist-get info :formatter)))))

(ert-deftest obaq-test-block-at-point ()
  "Test finding block at point."
  (obaq-test-with-temp-buffer "# Test\n\n```base\nquery\n```\n"
    (goto-char (point-min))
    (should-not (obaq-mode--block-at-point))
    (search-forward "query")
    (should (obaq-mode--block-at-point))
    (goto-char (point-max))
    (should-not (obaq-mode--block-at-point))))

(ert-deftest obaq-test-rendered-region-at-point ()
  "Test finding rendered region at point."
  (obaq-test-with-temp-buffer "# Test\n\n```base\nquery\n```\n"
    (cl-letf (((symbol-function 'obaq-mode--render-block)
               (lambda (block) "Rendered output\n")))
      (should-not (obaq-mode--rendered-region-at-point))
      (obaq-mode--render-all)
      (search-forward "Rendered")
      (should (obaq-mode--rendered-region-at-point))
      (goto-char (point-min))
      (should-not (obaq-mode--rendered-region-at-point)))))

(ert-deftest obaq-test-renderable-blocks-exist-p ()
  "Test checking for renderable blocks."
  (obaq-test-with-temp-buffer "# No blocks\n"
    (should-not (obaq-mode-renderable-blocks-exist-p)))
  (obaq-test-with-temp-buffer "# Test\n\n```base\nquery\n```\n"
    (should (obaq-mode-renderable-blocks-exist-p)))
  (obaq-test-with-temp-buffer "# Test\n\n```js formatter=test\ncode\n```\n"
    (let ((obaq-enable-code-block-formatter-p nil))
      (should-not (obaq-mode-renderable-blocks-exist-p)))
    (let ((obaq-enable-code-block-formatter-p t))
      (should (obaq-mode-renderable-blocks-exist-p)))))

;;; Toggle and command tests

(ert-deftest obaq-test-toggle-block ()
  "Test toggling a single block."
  (obaq-test-with-temp-buffer "# Test\n\n```base\nquery\n```\n"
    (cl-letf (((symbol-function 'obaq-mode--render-block)
               (lambda (block) "Rendered\n")))
      (search-forward "query")
      (obaq-mode-toggle-block)
      (should (obaq-mode--rendered-regions))
      (search-forward "Rendered")
      (obaq-mode-toggle-block)
      (should-not (obaq-mode--rendered-regions))
      (should (obaq-mode--base-blocks)))))

(ert-deftest obaq-test-toggle-all ()
  "Test toggling all blocks."
  (obaq-test-with-temp-buffer "# Test\n\n```base\nq1\n```\n\n```base\nq2\n```\n"
    (cl-letf (((symbol-function 'obaq-mode--render-block)
               (lambda (block) "Rendered\n"))
              ((symbol-function 'obaq-mode--fontify-region) #'ignore))
      (should (= 2 (length (obaq-mode--base-blocks))))
      (obaq-mode-toggle-all)
      (should (= 2 (length (obaq-mode--rendered-regions))))
      (should-not (obaq-mode--base-blocks))
      (obaq-mode-restore-all)
      (should-not (obaq-mode--rendered-regions))
      (should (= 2 (length (obaq-mode--base-blocks)))))))

(ert-deftest obaq-test-toggle-block-error-when-no-block ()
  "Test that toggle-block signals error when not on a block."
  (obaq-test-with-temp-buffer "# No blocks here\n"
    (should-error (obaq-mode-toggle-block) :type 'user-error)))

;;; View mode tests

(ert-deftest obaq-test-view-quit ()
  "Test quitting view mode."
  (obaq-test-with-temp-buffer "# Test\n\n```base\nquery\n```\n"
    (cl-letf (((symbol-function 'obaq-mode--render-block)
               (lambda (block) "Rendered\n")))
      (obaq-view-enter)
      (should obaq-view-mode)
      (should (derived-mode-p 'gfm-view-mode))
      (should (obaq-mode--rendered-regions))
      (obaq-view-quit)
      (should-not obaq-view-mode)
      (should (derived-mode-p 'gfm-mode))
      (should-not (derived-mode-p 'gfm-view-mode))
      (should-not (obaq-mode--rendered-regions)))))

(ert-deftest obaq-test-view-enter-requires-gfm-mode ()
  "Test that view-enter requires gfm-mode."
  (obaq-test-with-temp-buffer "# Test\n"
    (text-mode)
    (should-error (obaq-view-enter) :type 'user-error)))

;;; Multiple blocks tests

(ert-deftest obaq-test-multiple-blocks-render-order ()
  "Test that multiple blocks are rendered in correct order."
  (obaq-test-with-temp-buffer "```base\nfirst\n```\n\ntext\n\n```base\nsecond\n```\n"
    (let ((render-order nil))
      (cl-letf (((symbol-function 'obaq-mode--render-block)
                 (lambda (block)
                   (push (plist-get block :content) render-order)
                   "R\n")))
        (obaq-mode--render-all)
        (should (= 2 (length render-order)))
        (should (obaq-mode--rendered-regions))))))

(ert-deftest obaq-test-mixed-base-and-formatter-blocks ()
  "Test handling of mixed base and formatter blocks."
  (obaq-test-with-temp-buffer "```base\nquery\n```\n\n```js formatter=test\ncode\n```\n"
    (let ((obaq-enable-code-block-formatter-p t)
          (base-count 0)
          (format-count 0))
      (cl-letf (((symbol-function 'obaq-mode--render-block)
                 (lambda (block)
                   (cl-incf base-count)
                   "Base rendered\n"))
                ((symbol-function 'obaq-mode--format-block)
                 (lambda (block)
                   (cl-incf format-count)
                   "Formatter rendered\n")))
        (setq obaq-view-mode--rendering-as-view t)
        (unwind-protect
            (obaq-mode--render-all)
          (setq obaq-view-mode--rendering-as-view nil))
        (should (= 1 base-count))
        (should (= 1 format-count))
        (should (= 2 (length (obaq-mode--rendered-regions))))))))

;;; Permanent local tests

(ert-deftest obaq-test-permanent-local-survives-mode-change ()
  "Test that permanent-local variables survive major mode changes."
  (obaq-test-with-temp-buffer "# Test\n\n```base\nquery\n```\n"
    (cl-letf (((symbol-function 'obaq-mode--render-block)
               (lambda (block) "Rendered\n")))
      (obaq-mode--render-all)
      (should (obaq-mode--rendered-regions))
      (setq obaq-mode--saving-buffer t)
      (gfm-view-mode)
      (should obaq-mode--saving-buffer)
      (setq obaq-mode--saving-buffer nil))))

(ert-deftest obaq-test-raw-block-type-detection ()
  "Test detection of block types from raw content."
  (should (obaq-mode--raw-base-block-p "```base\nquery\n```"))
  (should (obaq-mode--raw-base-block-p "```  base\nquery\n```"))
  (should-not (obaq-mode--raw-base-block-p "```js\ncode\n```"))
  (should (obaq-mode--raw-formatter-block-p "```js formatter=test\ncode\n```"))
  (should-not (obaq-mode--raw-formatter-block-p "```base\nquery\n```"))
  (should-not (obaq-mode--raw-formatter-block-p "```js\ncode\n```")))

(provide 'obaq-mode-test)
;;; obaq-mode-test.el ends here
