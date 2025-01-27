# LANScreenShare
> Screen share over LAN using NodeJS Express and Socket.io

## 🚀 Self-Hosting Guide

### Prerequisites

#### System Requirements
- Node.js v14+ and npm
- MongoDB instance
- Python 3.11+ (for robotjs)
- Build tools (varies by OS)

#### OS-Specific Build Dependencies

<details>
<summary>Windows</summary>

<code>npm install --global --production windows-build-tools</code>

Run from an elevated PowerShell or CMD.exe (Run as Administrator)
</details>

<details>
<summary>macOS</summary>

<code>xcode-select --install</code>
</details>

<details>
<summary>Linux (Ubuntu/Debian)</summary>

<code>sudo apt-get update
sudo apt-get install python3.11 make gcc g++ libxtst-dev libpng++-dev
npm install -g node-gyp</code>
</details>

### 🔧 Installation

1. Clone the repository
<code>git clone https://github.com/flancast90/LANScreenShare.git
cd LANScreenShare</code>

2. Install dependencies
<code>npm install</code>

3. Create a `.env` file in the root directory:
<code>PORT=8000
MONGODB_URI=mongodb://localhost:27017/lanscreenshare
SESSION_SECRET=your_session_secret_here
NODE_ENV=development
</code>

# Optional: Stripe configuration for premium features
<code>STRIPE_SECRET_KEY=your_stripe_secret_key
STRIPE_PRICE_ID=your_stripe_price_id</code>

### 🖥️ Running the Server

1. Start MongoDB (if running locally)
<code>mongod</code>

2. Start the server
<code>node server.js</code>

The server will be available at `http://localhost:8000` (or your configured PORT)

### 👥 Client Setup

For each screen sharing host:

1. Install dependencies:
<code>npm install screenshot-desktop robotjs socket.io-client</code>

2. Update the endpoint in `client_host.js` to point to your server:
<code>const endpoint = "http://your-server:8000";</code>

3. Run the client:
<code>node client_host.js</code>

### 🔒 Security Considerations

- The server includes authentication and session management
- All connections use Socket.io with WebSocket fallback
- Premium features are protected by user authentication
- Remote control features require premium status

### ⚙️ Configuration Options

#### Server (`server.js`)
- `PORT`: Server listening port (default: 8000)
- `SESSION_SECRET`: Session encryption key
- `MONGODB_URI`: MongoDB connection string
- Socket.io configurations:
  - `pingTimeout`: 60000ms
  - `pingInterval`: 25000ms
  - `reconnectionAttempts`: 5
  - `reconnectionDelay`: 1000ms
  - `reconnectionDelayMax`: 5000ms

#### Client (`client_host.js`)
- `refreshRate`: Screenshot capture interval (default: 2000ms)
- Socket.io reconnection settings
- Image quality settings (JPEG quality: 30)

### 🛠️ Troubleshooting

<details>
<summary>Common Issues</summary>

1. **Build Errors**
   - Ensure all system prerequisites are installed
   - Check Python version (3.11+ required)
   - Run with administrative privileges

2. **Connection Issues**
   - Verify MongoDB is running
   - Check firewall settings
   - Ensure correct endpoint configuration

3. **Performance Issues**
   - Adjust `refreshRate` in client_host.js
   - Monitor network bandwidth usage
   - Check server logs for bottlenecks
</details>

### 📝 License
[MIT](https://choosealicense.com/licenses/mit/)

### 🤝 Contributing
Pull requests are welcome. For major changes, please open an issue first to discuss what you would like to change.

### ⭐️ Support
If you found this project helpful, please consider giving it a star on GitHub!