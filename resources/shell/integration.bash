# THub-Integration fuer Git Bash (reines ASCII).
#
# THub startet Git Bash mit
#   bash.exe --rcfile <Pfad>/integration.bash -i
# Eine Login-Shell (bash --login) wuerde --rcfile ignorieren. Darum laedt diese Datei zuerst, was
# eine Login-Shell von Git Bash laedt: /etc/profile und die erste vorhandene von ~/.bash_profile,
# ~/.bash_login, ~/.profile; gibt es keine davon, ~/.bashrc. Danach die Ordner-Meldung im Prompt,
# der claude-Ersatz und einmal der Startbefehl.
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

# 2. Ordner melden: Bei jedem Prompt meldet die Shell den aktuellen Ordner per OSC 7
# (file://<Rechner>/<Pfad>, prozentkodiert, Ende ESC \). Laufwerkspfade wie /c/Users meldet sie
# unveraendert, THub macht daraus C:\Users. Andere Orte (Mount-Punkte wie /tmp oder /usr) rechnet
# cygpath in Windows-Pfade um, nur wenn sich der Ordner geaendert hat. Der Prompt des Nutzers
# (PS1, PROMPT_COMMAND) bleibt; die Meldung kommt als letzter Schritt von PROMPT_COMMAND dazu und
# laesst $? unveraendert.
__thub_report_cwd() {
    local status=$?
    if [ "$PWD" != "$__thub_cwd_pwd" ]; then
        __thub_cwd_pwd=$PWD
        __thub_cwd_url=
        local dir=$PWD
        case $dir in
            /[a-zA-Z] | /[a-zA-Z]/*) ;;
            *) dir=$(cygpath -m -- "$dir" 2>/dev/null) || dir= ;;
        esac
        if [ -n "$dir" ]; then
            # Byteweise prozentkodieren (LC_ALL=C), Umlaute also als UTF-8-Bytes.
            local LC_ALL=C i c hex
            for (( i = 0; i < ${#dir}; i++ )); do
                c=${dir:i:1}
                case $c in
                    [a-zA-Z0-9/._~:-]) __thub_cwd_url+=$c ;;
                    *) printf -v hex '%%%02X' "'$c"; __thub_cwd_url+=$hex ;;
                esac
            done
            case $__thub_cwd_url in
                /*) ;;
                *) __thub_cwd_url=/$__thub_cwd_url ;;
            esac
        fi
    fi
    if [ -n "$__thub_cwd_url" ]; then
        printf '\033]7;file://%s%s\033\\' "${HOSTNAME:-localhost}" "$__thub_cwd_url"
    fi
    return $status
}
if [[ ${PROMPT_COMMAND+set} && ${PROMPT_COMMAND@a} == *a* ]]; then
    PROMPT_COMMAND+=(__thub_report_cwd)
else
    PROMPT_COMMAND="${PROMPT_COMMAND:+$PROMPT_COMMAND$'\n'}__thub_report_cwd"
fi

# 3. claude-Ersatz. MSYS baut die Befehlszeile fuer powershell.exe nach denselben Regeln (inklusive
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

# 4. Startbefehl genau einmal
if [ -n "$THUB_START_CMD" ]; then
    __thub_start=$THUB_START_CMD
    unset THUB_START_CMD
    eval "$__thub_start"
    unset __thub_start
fi
