// server.js — interactive code runner (Java, C/C++, Python, Node.js, SQL, C#, VB.NET)
// Spawns compilers/interpreters directly in the container.
// Adds a time cap and streams stdin/stdout over WebSocket.

const { WebSocketServer } = require("ws");
const { spawn } = require("child_process");
const fs = require("fs").promises;
const os = require("os");
const path = require("path");
const { randomUUID } = require("crypto");

const PORT = process.env.PORT || 8080;
const wss = new WebSocketServer({ port: PORT });

const CMDS = {
  java: { file: "Main.java",  compile: "javac Main.java",                     run: "timeout 12s java Main" },
  c:    { file: "main.c",     compile: "gcc -std=c17 -O2 main.c -o app",      run: "timeout 12s ./app" },
  cpp:  { file: "main.cpp",   compile: "g++ -std=gnu++17 -O2 main.cpp -o app",run: "timeout 12s ./app" },
  python:{ file: "main.py",   compile: "true",                                run: "timeout 12s python3 main.py" },
  javascript:{file:"main.js", compile: "true",                                run: "timeout 12s node main.js" },
  sql:  { file: "main.sql",   compile: "true",                                run: "timeout 12s sqlite3 -interactive -batch :memory:" },
  csharp:{file:"Program.cs",  compile: "mcs Program.cs -out:app.exe",         run: "timeout 12s mono app.exe" },
  vb:   { file: "Program.vb", compile: "vbnc Program.vb -out:app.exe",        run: "timeout 12s mono app.exe" }
};

function sh(cmd, cwd) {
  return spawn("bash", ["-lc", cmd], { cwd });
}

wss.on("connection", (ws) => {
  let proc = null, tmp = null;

  ws.on("message", async (raw) => {
    const msg = JSON.parse(raw.toString());

    if (msg.type === "start") {
      const L = CMDS[msg.lang];
      if (!L) return ws.send(JSON.stringify({ type:"out", data:`Unsupported language: ${msg.lang}\n` }));

      tmp = path.join(os.tmpdir(), "sess-" + randomUUID());
      await fs.mkdir(tmp, { recursive: true });
      await fs.writeFile(path.join(tmp, L.file), msg.code || "");

      // soft resource limits for the run step
      const ulimit = "ulimit -t 8 -f 10240 -n 64; ";

      // compile
      const c = sh(L.compile, tmp);
      c.stdout.on("data", d => ws.send(JSON.stringify({ type:"out", data: d.toString() })));
      c.stderr.on("data", d => ws.send(JSON.stringify({ type:"out", data: d.toString() })));
      c.on("close", code => {
        if (code !== 0) return ws.send(JSON.stringify({ type:"exit", code }));

        // run (interactive)
        proc = sh(ulimit + L.run, tmp);
        proc.stdout.on("data", d => ws.send(JSON.stringify({ type:"out", data: d.toString() })));
        proc.stderr.on("data", d => ws.send(JSON.stringify({ type:"out", data: d.toString() })));
        proc.on("close", code => ws.send(JSON.stringify({ type:"exit", code })));
      });
    }

    if (msg.type === "stdin" && proc) {
      proc.stdin.write(msg.data); // include '\n'
    }
  });

  ws.on("close", async () => {
    try { proc?.kill("SIGKILL"); } catch {}
    try { tmp && await fs.rm(tmp, { recursive:true, force:true }); } catch {}
  });
});

console.log("Runner listening on :" + PORT);
