using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net.Sockets;
using System.Text;
using System.Threading;
using System.Windows.Forms;

namespace ImmichMini
{
    internal static class Program
    {
        [STAThread]
        private static void Main()
        {
            bool created;
            using (var mutex = new Mutex(true, @"Local\ImmichMiniLauncher", out created))
            {
                if (!created)
                {
                    return;
                }

                Application.EnableVisualStyles();
                Application.SetCompatibleTextRenderingDefault(false);
                Application.Run(new LauncherForm());
            }
        }
    }

    internal sealed class LauncherForm : Form
    {
        private const int Port = 3310;
        private readonly Label statusLabel;
        private readonly Label libraryLabel;
        private readonly Button chooseButton;
        private readonly Button openButton;
        private readonly Button stopButton;
        private System.Windows.Forms.Timer statusTimer;
        private Process serverProcess;

        public LauncherForm()
        {
            Text = "Immich Mini";
            ClientSize = new Size(560, 240);
            MinimumSize = new Size(560, 240);
            StartPosition = FormStartPosition.CenterScreen;
            BackColor = Color.FromArgb(24, 28, 27);
            ForeColor = Color.FromArgb(245, 243, 237);
            Font = new Font("Segoe UI", 10f);

            var title = new Label
            {
                Text = "Immich Mini",
                Font = new Font("Segoe UI", 20f, FontStyle.Bold),
                AutoSize = true,
                Location = new Point(24, 20)
            };
            var subtitle = new Label
            {
                Text = "本地媒体库 · 127.0.0.1",
                ForeColor = Color.FromArgb(170, 178, 173),
                AutoSize = true,
                Location = new Point(27, 62)
            };
            statusLabel = new Label
            {
                Text = "正在检查服务…",
                AutoSize = true,
                Location = new Point(27, 100)
            };
            libraryLabel = new Label
            {
                Text = "媒体目录：" + SelectedLibrary(),
                ForeColor = Color.FromArgb(190, 198, 192),
                AutoEllipsis = true,
                Size = new Size(504, 24),
                Location = new Point(27, 130)
            };
            chooseButton = MakeButton("选择媒体目录", new Point(27, 180), 112);
            chooseButton.Click += delegate { SelectLibrary(); };
            openButton = MakeButton("打开界面", new Point(368, 180), 80);
            openButton.Click += delegate { OpenBrowser(); };
            stopButton = MakeButton("停止服务", new Point(456, 180), 80);
            stopButton.Click += delegate { StopServer(); };

            Controls.Add(title);
            Controls.Add(subtitle);
            Controls.Add(statusLabel);
            Controls.Add(libraryLabel);
            Controls.Add(chooseButton);
            Controls.Add(openButton);
            Controls.Add(stopButton);

            Shown += delegate
            {
                EnsureServer();
                statusTimer = new System.Windows.Forms.Timer { Interval = 1000 };
                statusTimer.Tick += delegate { RefreshStatus(); };
                statusTimer.Start();
                RefreshStatus();
            };
            FormClosing += delegate
            {
                if (statusTimer != null)
                {
                    statusTimer.Stop();
                    statusTimer.Dispose();
                }
                StopServer();
            };
        }

        private Button MakeButton(string text, Point location, int width)
        {
            return new Button
            {
                Text = text,
                Location = location,
                Size = new Size(width, 32),
                FlatStyle = FlatStyle.Flat,
                BackColor = Color.FromArgb(28, 117, 107),
                ForeColor = Color.White,
                FlatAppearance = { BorderSize = 0 }
            };
        }

        private static string AppRoot
        {
            get { return AppDomain.CurrentDomain.BaseDirectory.TrimEnd(Path.DirectorySeparatorChar); }
        }

        private static string EnvPath
        {
            get { return Path.Combine(AppRoot, ".env"); }
        }

        private static string SelectedLibrary()
        {
            try
            {
                if (!File.Exists(EnvPath))
                {
                    return "尚未选择";
                }
                foreach (var line in File.ReadAllLines(EnvPath))
                {
                    if (line.StartsWith("IMMICH_MINI_LIBRARY=", StringComparison.OrdinalIgnoreCase))
                    {
                        return line.Substring("IMMICH_MINI_LIBRARY=".Length);
                    }
                }
            }
            catch
            {
            }
            return "尚未选择";
        }

        private static bool IsServerReady()
        {
            try
            {
                using (var client = new TcpClient())
                {
                    var task = client.ConnectAsync("127.0.0.1", Port);
                    if (!task.Wait(250))
                    {
                        return false;
                    }
                    return client.Connected;
                }
            }
            catch
            {
                return false;
            }
        }

        private void EnsureServer()
        {
            if (IsServerReady())
            {
                return;
            }

            var bundledNode = Path.Combine(AppRoot, "runtime", "node.exe");
            var node = File.Exists(bundledNode) ? bundledNode : "node";
            var start = new ProcessStartInfo
            {
                FileName = node,
                Arguments = "--enable-source-maps \"dist\\server\\index.js\"",
                WorkingDirectory = AppRoot,
                UseShellExecute = false,
                CreateNoWindow = true,
                WindowStyle = ProcessWindowStyle.Hidden
            };
            start.EnvironmentVariables["PORT"] = Port.ToString();
            serverProcess = Process.Start(start);
            for (var index = 0; index < 80 && !IsServerReady(); index++)
            {
                Thread.Sleep(250);
                Application.DoEvents();
            }
        }

        private void SelectLibrary()
        {
            using (var dialog = new FolderBrowserDialog())
            {
                dialog.Description = "选择媒体目录";
                dialog.ShowNewFolderButton = false;
                if (dialog.ShowDialog(this) != DialogResult.OK)
                {
                    return;
                }
                StopServer();
                var lines = File.Exists(EnvPath) ? File.ReadAllLines(EnvPath) : new string[0];
                var output = new StringBuilder();
                var replaced = false;
                foreach (var line in lines)
                {
                    if (line.StartsWith("IMMICH_MINI_LIBRARY=", StringComparison.OrdinalIgnoreCase))
                    {
                        output.AppendLine("IMMICH_MINI_LIBRARY=" + dialog.SelectedPath);
                        replaced = true;
                    }
                    else
                    {
                        output.AppendLine(line);
                    }
                }
                if (!replaced)
                {
                    output.AppendLine("IMMICH_MINI_LIBRARY=" + dialog.SelectedPath);
                }
                File.WriteAllText(EnvPath, output.ToString(), new UTF8Encoding(false));
                libraryLabel.Text = "媒体目录：" + dialog.SelectedPath;
                EnsureServer();
                RefreshStatus();
            }
        }

        private void RefreshStatus()
        {
            var ready = IsServerReady();
            statusLabel.Text = ready ? "● 服务已运行" : "● 服务未运行";
            statusLabel.ForeColor = ready ? Color.FromArgb(85, 210, 188) : Color.FromArgb(230, 110, 100);
            openButton.Enabled = ready;
            stopButton.Enabled = ready;
        }

        private void OpenBrowser()
        {
            Process.Start(new ProcessStartInfo
            {
                FileName = "http://127.0.0.1:" + Port,
                UseShellExecute = true
            });
        }

        private void StopServer()
        {
            if (serverProcess != null && !serverProcess.HasExited)
            {
                try
                {
                    serverProcess.Kill();
                    serverProcess.WaitForExit(5000);
                }
                catch
                {
                }
            }
            serverProcess = null;
            RefreshStatus();
        }
    }
}
