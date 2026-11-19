# THub-Integration fuer Git Bash (reines ASCII).
#
# THub startet Git Bash mit
#   bash.exe --rcfile <Pfad>/integration.bash -i
# Eine Login-Shell (bash --login) wuerde --rcfile ignorieren. Darum laedt diese Datei zuerst, was
# eine Login-Shell von Git Bash laedt: /etc/profile und die erste vorhandene von ~/.bash_profile,
# ~/.bash_login, ~/.profile; gibt es keine davon, ~/.bashrc. Danach der claude-Ersatz und einmal
# der Startbefehl.
#
# Umgebung: THUB_STARTER (Windows-Pfad zu starter.ps1), optional THUB_START_CMD (Startbefehl,
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
if [ -n "$THUB_STARTER" ]; then
    __thub_powershell="$(cygpath -u "${SYSTEMROOT:-C:\\Windows}")/System32/WindowsPowerShell/v1.0/powershell.exe"
    __thub_starter() {
        "$__thub_powershell" -NoProfile -NoLogo -ExecutionPolicy Bypass -File "$THUB_STARTER" "$@"
    }
    claude() {
        __thub_starter "$@"
    }
fi

# 3. Startbefehl genau einmal
if [ -n "$THUB_START_CMD" ]; then
    __thub_start=$THUB_START_CMD
    unset THUB_START_CMD
    eval "$__thub_start"
    unset __thub_start
fi
