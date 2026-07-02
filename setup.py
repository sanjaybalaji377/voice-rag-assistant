import os
import sys
import subprocess
import urllib.request
import zipfile
import shutil

def run_setup():
    print("==================================================")
    print("      Setting Up Voice AI Agent Project")
    print("==================================================")

    # 1. Install python dependencies
    print("\n-> Step 1: Installing Python FastAPI dependencies...")
    backend_dir = r"c:\voice agent\backend"
    requirements = os.path.join(backend_dir, "requirements.txt")
    if os.path.exists(requirements):
        try:
            subprocess.run([sys.executable, "-m", "pip", "install", "-r", requirements], check=True)
            print("Python packages installed successfully.")
        except subprocess.CalledProcessError as e:
            print("Warning: Failed to install Python dependencies automatically. Run pip manually.")
    
    # 2. Check and bootstrap Node.js
    print("\n-> Step 2: Checking local Node.js compiler runtime...")
    node_dir = r"c:\voice agent\node"
    node_exe = os.path.join(node_dir, "node.exe")
    
    if not os.path.exists(node_exe):
        print("Local Node.js runtime not found. Bootstrapping Node.js v20.15.0...")
        temp_zip = r"c:\voice agent\node_temp.zip"
        url = "https://nodejs.org/dist/v20.15.0/node-v20.15.0-win-x64.zip"
        
        try:
            print(f"Downloading Node.js zip from {url}...")
            urllib.request.urlretrieve(url, temp_zip)
            
            print("Extracting Node.js package...")
            temp_extract = r"c:\voice agent\node_temp_extract"
            with zipfile.ZipFile(temp_zip, 'r') as zip_ref:
                zip_ref.extractall(temp_extract)
            
            # Find the extracted folder
            extracted_folders = [f for f in os.listdir(temp_extract) if os.path.isdir(os.path.join(temp_extract, f))]
            if extracted_folders:
                src_folder = os.path.join(temp_extract, extracted_folders[0])
                if os.path.exists(node_dir):
                    shutil.rmtree(node_dir)
                shutil.move(src_folder, node_dir)
                print(f"Node.js installed successfully at {node_dir}.")
            else:
                print("Error: Extraction failed, could not find runtime folder.")
                
            # Clean up temp files
            if os.path.exists(temp_zip):
                os.remove(temp_zip)
            if os.path.exists(temp_extract):
                shutil.rmtree(temp_extract)
            
        except Exception as e:
            print(f"Error: Node.js download/bootstrap failed: {str(e)}")
            return
    else:
        print(f"Local Node.js runtime detected at {node_dir}")

    # 3. Prepend node path to env to run npm installs
    env = os.environ.copy()
    env["PATH"] = node_dir + os.pathsep + env.get("PATH", "")

    # 4. Install frontend npm dependencies
    print("\n-> Step 3: Installing React frontend packages (npm install)...")
    frontend_dir = r"c:\voice agent\frontend"
    # Resolve absolute path to local npm executable to prevent WinError 2 on Windows
    npm_cmd = os.path.join(node_dir, "npm.cmd") if os.name == 'nt' else os.path.join(node_dir, "bin", "npm")
    try:
        subprocess.run([npm_cmd, "install"], cwd=frontend_dir, env=env, check=True)
        print("Frontend React packages installed successfully.")
    except Exception as e:
        print(f"Warning: npm install failed or skipped: {str(e)}")
        
    print("\n==================================================")
    print("SETUP COMPLETE! Run 'python run.py' to launch.")
    print("==================================================")

if __name__ == "__main__":
    run_setup()
