import os
import json
import http.server
import socketserver
import urllib.parse

PORT = 8000
DATA_FILE = "data.json"

# Helper to scan directory for JPG/PNG/WEBP images
def get_images():
    valid_exts = {".jpg", ".jpeg", ".png", ".webp"}
    images = []
    try:
        for file in os.listdir("."):
            if os.path.isfile(file):
                ext = os.path.splitext(file)[1].lower()
                if ext in valid_exts:
                    images.append(file)
        # Sort files numerically
        images.sort()
    except Exception as e:
        print(f"Error scanning images: {e}")
    return images

# Helper to merge images with data.json
def get_merged_data():
    existing_data = []
    if os.path.exists(DATA_FILE):
        try:
            with open(DATA_FILE, "r", encoding="utf-8") as f:
                existing_data = json.load(f)
                if not isinstance(existing_data, list):
                    existing_data = []
        except Exception as e:
            print(f"Error reading data.json: {e}")
            existing_data = []
            
    # If data.json already has items, return them directly to prevent duplication
    if len(existing_data) > 0:
        return existing_data
        
    # Otherwise, initialize from folder images
    images = get_images()
    merged = []
    for img in images:
        merged.append({
            "image": img,
            "name": "",
            "spec": "",
            "totalBottles": "",
            "newCount": "",
            "openedCount": "",
            "remarks": ""
        })
    return merged

class CustomHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # Disable caching for API development
        if self.path.startswith('/api/'):
            self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
        super().end_headers()

    def do_GET(self):
        if self.path == '/api/data':
            data = get_merged_data()
            response_data = {
                "success": True,
                "data": data
            }
            response_bytes = json.dumps(response_data, ensure_ascii=False).encode('utf-8')
            
            self.send_response(200)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Content-Length', str(len(response_bytes)))
            self.end_headers()
            self.wfile.write(response_bytes)
        else:
            # Handle static files normally using parent class method
            super().do_GET()

    def do_POST(self):
        if self.path == '/api/save':
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            
            try:
                client_data = json.loads(post_data.decode('utf-8'))
                if not isinstance(client_data, list):
                    raise ValueError("Data must be a list")
                    
                # Save to data.json
                with open(DATA_FILE, "w", encoding="utf-8") as f:
                    json.dump(client_data, f, ensure_ascii=False, indent=2)
                    
                response_data = {"success": True, "message": "Saved successfully"}
            except Exception as e:
                print(f"Error saving data: {e}")
                self.send_response(400)
                response_data = {"success": False, "message": str(e)}
                
            response_bytes = json.dumps(response_data, ensure_ascii=False).encode('utf-8')
            self.send_response(200)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Content-Length', str(len(response_bytes)))
            self.end_headers()
            self.wfile.write(response_bytes)
        else:
            self.send_response(404)
            self.end_headers()

def run_server():
    # Force current working directory to script location
    script_dir = os.path.dirname(os.path.abspath(__file__))
    os.chdir(script_dir)
    
    # Allow address reuse to avoid port block on restart
    socketserver.TCPServer.allow_reuse_address = True
    
    with socketserver.TCPServer(("", PORT), CustomHTTPRequestHandler) as httpd:
        print("==================================================")
        print("保健食品庫存管理系統已透過 Python 啟動！")
        print(f"請在瀏覽器中開啟: http://localhost:{PORT}")
        print("==================================================")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n伺服器已終止。")

if __name__ == '__main__':
    run_server()
