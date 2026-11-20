// Nachgemachtes `claude` fuer die Shell-Integrationstests (Teststelle 2).
//
// Schreibt pro Aufruf eine JSON-Zeile an die Datei in STUB_OUT:
//   - rawCommandLine: GetCommandLineW() unveraendert
//   - rawArgs:        dieselbe Zeile ohne argv[0] (Regeln fuer argv[0] wie CommandLineToArgvW)
//   - argv:           CommandLineToArgvW (shell32), ohne argv[0]
//   - argvCrt2008:    eigene Zerlegung nach den Regeln der C-Laufzeit ab 2008 (UCRT, Node, Bun/Zig)
//   - argvCrtOld:     eigene Zerlegung nach den Regeln der alten msvcrt (vor 2008)
//   - env:            ausgewaehlte Umgebungsvariablen
// Verhalten aus der Datei in STUB_CONFIG (Zeilen key=value):
//   exit=<n>        Exit-Code (Standard 0)
//   wait=1          wartet auf Ctrl+C (hoechstens 120 s), endet dann mit ctrlcExit
//   ctrlcExit=<n>   Exit-Code nach Ctrl+C (Standard 130)
// Nur C# 5, damit der csc.exe des .NET Framework 4 reicht.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

static class ClaudeStub
{
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)]
    static extern IntPtr GetCommandLineW();

    [DllImport("shell32.dll", SetLastError = true)]
    static extern IntPtr CommandLineToArgvW([MarshalAs(UnmanagedType.LPWStr)] string cmdLine, out int numArgs);

    [DllImport("kernel32.dll")]
    static extern IntPtr LocalFree(IntPtr hMem);

    static readonly string[] EnvNames = {
        "THUB_TAB_ID", "THUB_API", "THUB_TOKEN", "THUB_START_CMD", "NO_PROXY", "STUB_MARK"
    };

    static int Main()
    {
        string cmd = Marshal.PtrToStringUni(GetCommandLineW());
        var cfg = ReadConfig(Environment.GetEnvironmentVariable("STUB_CONFIG"));

        var sb = new StringBuilder();
        sb.Append('{');
        Prop(sb, "pid", Process.GetCurrentProcess().Id.ToString()); sb.Append(',');
        Prop(sb, "exe", Json(Process.GetCurrentProcess().MainModule.FileName)); sb.Append(',');
        Prop(sb, "cwd", Json(Environment.CurrentDirectory)); sb.Append(',');
        Prop(sb, "rawCommandLine", Json(cmd)); sb.Append(',');
        Prop(sb, "rawArgs", Json(RawArgs(cmd))); sb.Append(',');
        Prop(sb, "argv", JsonList(Skip1(ShellSplit(cmd)))); sb.Append(',');
        Prop(sb, "argvCrt2008", JsonList(Skip1(CrtSplit(cmd, true)))); sb.Append(',');
        Prop(sb, "argvCrtOld", JsonList(Skip1(CrtSplit(cmd, false)))); sb.Append(',');
        sb.Append("\"env\":{");
        bool first = true;
        foreach (var name in EnvNames)
        {
            string v = Environment.GetEnvironmentVariable(name);
            if (v == null) continue;
            if (!first) sb.Append(',');
            first = false;
            Prop(sb, name, Json(v));
        }
        sb.Append("}}");

        string outPath = Environment.GetEnvironmentVariable("STUB_OUT");
        if (!string.IsNullOrEmpty(outPath))
        {
            AppendLine(outPath, sb.ToString());
        }
        Console.WriteLine("STUB-RAN");

        int exitCode = Int(cfg, "exit", 0);
        if (Int(cfg, "wait", 0) == 1)
        {
            int ctrlcExit = Int(cfg, "ctrlcExit", 130);
            var done = new ManualResetEvent(false);
            Console.CancelKeyPress += delegate(object s, ConsoleCancelEventArgs e)
            {
                e.Cancel = true;
                done.Set();
            };
            Console.WriteLine("STUB-WAITING");
            if (done.WaitOne(120000))
            {
                Console.WriteLine("STUB-CTRLC");
                return ctrlcExit;
            }
            Console.WriteLine("STUB-TIMEOUT");
            return 99;
        }
        return exitCode;
    }

    static void AppendLine(string path, string line)
    {
        // Mehrere Prozesse koennen gleichzeitig schreiben; kurz wiederholen, falls die Datei gesperrt ist.
        for (int i = 0; i < 50; i++)
        {
            try
            {
                using (var fs = new FileStream(path, FileMode.Append, FileAccess.Write, FileShare.Read))
                {
                    var bytes = new UTF8Encoding(false).GetBytes(line + "\n");
                    fs.Write(bytes, 0, bytes.Length);
                }
                return;
            }
            catch (IOException)
            {
                Thread.Sleep(20);
            }
        }
    }

    static Dictionary<string, string> ReadConfig(string path)
    {
        var d = new Dictionary<string, string>();
        if (string.IsNullOrEmpty(path) || !File.Exists(path)) return d;
        foreach (var line in File.ReadAllLines(path))
        {
            int i = line.IndexOf('=');
            if (i > 0) d[line.Substring(0, i).Trim()] = line.Substring(i + 1).Trim();
        }
        return d;
    }

    static int Int(Dictionary<string, string> d, string key, int def)
    {
        string v;
        int n;
        if (d.TryGetValue(key, out v) && int.TryParse(v, out n)) return n;
        return def;
    }

    static List<string> ShellSplit(string cmd)
    {
        var list = new List<string>();
        int n;
        IntPtr p = CommandLineToArgvW(cmd, out n);
        if (p == IntPtr.Zero) return list;
        try
        {
            for (int i = 0; i < n; i++)
            {
                list.Add(Marshal.PtrToStringUni(Marshal.ReadIntPtr(p, i * IntPtr.Size)));
            }
        }
        finally
        {
            LocalFree(p);
        }
        return list;
    }

    // argv[0]: bis zum naechsten Anfuehrungszeichen bzw. Leerraum, ohne Backslash-Regeln.
    static int SkipArgv0(string cmd)
    {
        int i = 0;
        if (i < cmd.Length && cmd[i] == '"')
        {
            i++;
            while (i < cmd.Length && cmd[i] != '"') i++;
            if (i < cmd.Length) i++;
        }
        else
        {
            while (i < cmd.Length && cmd[i] != ' ' && cmd[i] != '\t') i++;
        }
        return i;
    }

    static string RawArgs(string cmd)
    {
        int i = SkipArgv0(cmd);
        while (i < cmd.Length && (cmd[i] == ' ' || cmd[i] == '\t')) i++;
        return cmd.Substring(i);
    }

    // Zerlegung nach den Regeln der C-Laufzeit. modern=true: ab VS2008 ("" in Anfuehrungszeichen
    // ergibt " und bleibt in Anfuehrungszeichen), sonst alte msvcrt ("" ergibt " und beendet sie).
    static List<string> CrtSplit(string cmd, bool modern)
    {
        var list = new List<string>();
        int i = SkipArgv0(cmd);
        list.Add(cmd.Substring(0, i).Trim('"'));
        bool inQuote = false;
        while (true)
        {
            while (i < cmd.Length && (cmd[i] == ' ' || cmd[i] == '\t')) i++;
            if (i >= cmd.Length) break;
            var arg = new StringBuilder();
            while (true)
            {
                bool copy = true;
                int slashes = 0;
                while (i < cmd.Length && cmd[i] == '\\') { slashes++; i++; }
                if (i < cmd.Length && cmd[i] == '"')
                {
                    if (slashes % 2 == 0)
                    {
                        if (inQuote && i + 1 < cmd.Length && cmd[i + 1] == '"')
                        {
                            i++;
                            if (!modern) inQuote = !inQuote;
                        }
                        else
                        {
                            copy = false;
                            inQuote = !inQuote;
                        }
                    }
                    slashes /= 2;
                }
                arg.Append('\\', slashes);
                if (i >= cmd.Length || (!inQuote && (cmd[i] == ' ' || cmd[i] == '\t'))) break;
                if (copy) arg.Append(cmd[i]);
                i++;
            }
            list.Add(arg.ToString());
        }
        return list;
    }

    static List<string> Skip1(List<string> l)
    {
        if (l.Count > 0) l.RemoveAt(0);
        return l;
    }

    static void Prop(StringBuilder sb, string name, string jsonValue)
    {
        sb.Append(Json(name)).Append(':').Append(jsonValue);
    }

    static string JsonList(List<string> items)
    {
        var sb = new StringBuilder("[");
        for (int i = 0; i < items.Count; i++)
        {
            if (i > 0) sb.Append(',');
            sb.Append(Json(items[i]));
        }
        return sb.Append(']').ToString();
    }

    static string Json(string s)
    {
        var sb = new StringBuilder("\"");
        foreach (char c in s)
        {
            switch (c)
            {
                case '"': sb.Append("\\\""); break;
                case '\\': sb.Append("\\\\"); break;
                case '\n': sb.Append("\\n"); break;
                case '\r': sb.Append("\\r"); break;
                case '\t': sb.Append("\\t"); break;
                default:
                    if (c < 0x20) sb.Append("\\u").Append(((int)c).ToString("x4"));
                    else sb.Append(c);
                    break;
            }
        }
        return sb.Append('"').ToString();
    }
}
