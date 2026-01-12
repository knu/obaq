# obaq-mode

`obaq-mode` renders Obsidian Bases ` ```base ` code blocks by invoking the `obaq` CLI.  Rendered output is read-only and can be toggled per block or for all blocks.

## Requirements

- Emacs 27.2+
- `obsidian.el`
- `markdown-mode`
- `obaq` CLI on your PATH

## Installation

```elisp
(use-package obaq-mode
  :vc (:url "https://github.com/knu/obaq")
  :custom
  (obaq-mode t))
```

## Usage

Enable global `obaq-mode` and use its key bindings in `obsidian-mode` buffers.

Key bindings (in `obsidian-mode` via `obaq-buffer-mode`):

- `C-c C-q v` Enter `gfm-view-mode` and enable `obaq-view-mode`
- `C-c C-q t` Toggle the block at point
- `C-c C-q a` Toggle all blocks
- `C-c C-q c` Clear rendered output (restore all blocks)
- `C-c C-q q` Toggle `obaq-buffer-mode`

Key bindings (in `gfm-view-mode` via `obaq-view-mode`):

- `q`   Exit `obaq-view-mode` and restore blocks
- `RET` Follow link at point (`obsidian-follow-link-at-point`)
- `TAB` Next link (`markdown-next-link`)
- `S-TAB` Previous link (`markdown-previous-link`)

## Customization

- `obaq-mode-command`

  Path or command name for the `obaq` CLI.

- `obaq-mode-format`

  Output format (default: `markdown`).

- `obaq-enable-code-block-formatter-p`

  When non-nil, code fences like ` ```lang formatter=NAME ` are
  replaced by the output of the executable at `VAULT/.bin/NAME` (VAULT
  is `obsidian-directory`).  The block contents are sent on stdin and
  the command output is inserted as markdown.  The formatter runs only
  in `obaq-view-mode`.  If the executable is missing or not
  executable, the block is left unchanged.  Environment variables
  `CODE_FENCE` and `CODE_LANGUAGE` are set for the command.

- `obaq-auto-view-enter-p`

  Automatically enter `obaq-view-mode` when enabling
  `obaq-buffer-mode` and renderable blocks are present.  Auto-enter
  runs once per buffer, even across major mode changes.

## License

Licensed under the 2-clause BSD license.  See LICENSE for details.
