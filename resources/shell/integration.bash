# TermHub-Integration fuer Git Bash (reines ASCII).
#
# TermHub startet Git Bash mit
#   bash.exe --rcfile <Pfad>/integration.bash -i
# Eine Login-Shell (bash --login) wuerde --rcfile ignorieren. Darum laedt diese Datei zuerst, was
# eine Login-Shell von Git Bash laedt: /etc/profile und die erste vorhandene von ~/.bash_profile,
# ~/.bash_login, ~/.profile; gibt es keine davon, ~/.bashrc. Danach der claude-Ersatz und einmal
# der Startbefehl.
#
# Umgebung: TERMHUB_STARTER (Windows-Pfad zu starter.ps1), optional TERMHUB_START_CMD (Startbefehl,
# Bash-Code, wird vor dem Ausfuehren entfernt).

# 1. Profile wie bei einer Login-Shell
if [ -f /etc/profile ]; then
    . /etc/profile
fi
if [ -f "$HOME/.bash_profile" ]; then
    . "$HOME/.bash_profile"
elif [ -f "$HOME/.bash_login" ]; then
    . "$HOME/.bash_login"
elif [ -f "$HOME/.profile" ]; then
    . "$HOME/.profile"
elif [ -f "$HOME/.bashrc" ]; then
    . "$HOME/.bashrc"
fi

# 2. claude-Ersatz. MSYS baut die Befehlszeile fuer powershell.exe nach denselben Regeln (inklusive
# Pfadumwandlung) wie fuer claude.exe, der Starter liest sie roh.
if [ -n "$TERMHUB_STARTER" ]; then
    __termhub_powershell="$(cygpath -u "${SYSTEMROOT:-C:\\Windows}")/System32/WindowsPowerShell/v1.0/powershell.exe"
    __termhub_starter() {
        "$__termhub_powershell" -NoProfile -NoLogo -ExecutionPolicy Bypass -File "$TERMHUB_STARTER" "$@"
    }
    claude() {
        __termhub_starter "$@"
    }
fi

# 3. Startbefehl genau einmal
if [ -n "$TERMHUB_START_CMD" ]; then
    __termhub_start=$TERMHUB_START_CMD
    unset TERMHUB_START_CMD
    eval "$__termhub_start"
    unset __termhub_start
fi
