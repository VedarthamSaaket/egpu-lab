on run
  set projectPath to (POSIX path of (path to home folder)) & "development/egpu-lab"
  set portNumber to "8791"
  do shell script "cd " & quoted form of projectPath & " && (/usr/sbin/lsof -ti tcp:" & portNumber & " >/dev/null 2>&1 || (nohup /usr/bin/python3 server.py " & portNumber & " >/tmp/egpu-lab-server.log 2>&1 &))"
  delay 1
  do shell script "open http://localhost:" & portNumber & "/app/"
end run
