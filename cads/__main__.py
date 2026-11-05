"""``python -m cads``: start the server and open the web page in the default browser."""

import threading
import webbrowser

import uvicorn

HOST, PORT = "127.0.0.1", 8000

if __name__ == "__main__":
    threading.Timer(1.5, webbrowser.open, args=(f"http://{HOST}:{PORT}/",)).start()
    uvicorn.run("cads.api.app:create_app", factory=True, host=HOST, port=PORT)
