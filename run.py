import os
import sys
import subprocess
import time
import webbrowser
import threading

def log_streamer(stream, prefix):
    """
    Thread target function that reads from a process stream non-blockingly
    and prints to stdout with a colored prefix.
    """
    try:
        for line in iter(stream.readline, ''):
            if line:
                print(f"{prefix} {line.strip()}")
    except Exception:
        pass

def run_project():
    print("==================================================")
    print("      Starting Voice AI Agent Dashboard")
    print("==================================================")
    
    # 1. Setup path environment to include local node bin folder
    node_path = r"c:\voice agent\node"
    env = os.environ.copy()
    if os.path.exists(node_path):
        env["PATH"] = node_path + os.pathsep + env.get("PATH", "")
        print(f"-> Path environment configured with Node binaries: {node_path}")
    
    # 2. Check Python FastAPI backend script exists
    backend_dir = r"c:\voice agent\backend"
    backend_script = os.path.join(backend_dir, "main.py")
    if not os.path.exists(backend_script):
        print(f"Error: Python backend script not found at {backend_script}")
        sys.exit(1)
        
    # 3. Start Python FastAPI backend
    print("-> Launching Python FastAPI Backend on port 5000...")
    backend_proc = subprocess.Popen(
        [sys.executable, "main.py"],
        cwd=backend_dir,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
        env=env
    )
    
    # 4. Start Vite Frontend Client
    frontend_dir = r"c:\voice agent\frontend"
    print("-> Launching React Vite Frontend Client on port 3000...")
    
    # Resolve absolute path to local npm executable to prevent WinError 2 on Windows
    local_npm = os.path.join(node_path, "npm.cmd" if os.name == 'nt' else "npm")
    npm_cmd = local_npm if os.path.exists(local_npm) else ("npm.cmd" if os.name == 'nt' else "npm")
    
    frontend_proc = subprocess.Popen(
        [npm_cmd, "run", "dev"],
        cwd=frontend_dir,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
        env=env
    )
    
    # 5. Spin up logging streams threads
    # ANSI escape colors: \033[94m is Blue (Backend), \033[92m is Green (Frontend)
    threading.Thread(
        target=log_streamer, 
        args=(backend_proc.stdout, "\033[94m[BACKEND]\033[0m"), 
        daemon=True
    ).start()
    
    threading.Thread(
        target=log_streamer, 
        args=(frontend_proc.stdout, "\033[92m[FRONTEND]\033[0m"), 
        daemon=True
    ).start()
    
    # 6. Wait for startup and open the browser
    time.sleep(3.5)
    print("-> Opening dashboard in your default browser...")
    webbrowser.open("http://localhost:3000")
    
    print("\nProject is running! Press Ctrl+C in this terminal window to stop both servers.")
    try:
        while True:
            # Check if either process terminated unexpectedly
            if backend_proc.poll() is not None:
                print("Error: FastAPI Backend process terminated unexpectedly.")
                break
            if frontend_proc.poll() is not None:
                print("Error: React Vite Frontend process terminated unexpectedly.")
                break
            time.sleep(1.0)
    except KeyboardInterrupt:
        print("\nShutting down servers...")
    finally:
        # Clean shutdown of both subprocesses
        try:
            backend_proc.terminate()
            backend_proc.wait(timeout=2.0)
        except Exception:
            pass
            
        try:
            frontend_proc.terminate()
            frontend_proc.wait(timeout=2.0)
        except Exception:
            pass
            
        print("Goodbye!")

if __name__ == "__main__":
    run_project()
