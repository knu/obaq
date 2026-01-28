EMACS ?= emacs

SRCS = obaq-mode.el
TESTS = obaq-mode-test.el

.PHONY: all compile test lint clean

all: compile

compile: $(SRCS:.el=.elc)

%.elc: %.el
	$(EMACS) --batch -L . -f batch-byte-compile $<

test: compile
	$(EMACS) --batch -L . -l $(TESTS) -f ert-run-tests-batch-and-exit

lint:
	$(EMACS) --batch -L . \
		--eval "(setq byte-compile-error-on-warn t)" \
		-f batch-byte-compile $(SRCS)

clean:
	rm -f *.elc
