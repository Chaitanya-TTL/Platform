# TeamCenter → Configit ETL Pipeline MVP

Complete end-to-end ETL pipeline with beautiful real-time UI.

## 📁 Project Structure

```
backend/                    # Original PoC (DO NOT MODIFY)
├── samples/ConfigitAceIntegration/   # Core ETL services
├── docs/
└── README.md

middleware/                 # .NET Core REST API
├── Controllers/
├── Services/
├── Models/
├── appsettings.json
└── Program.cs

frontend/                   # Next.js SPA
├── app/                    # Pages & layouts
├── components/             # React components
├── lib/                    # Utilities & API client
├── app/
│   ├── globals.css        # Tailwind + custom styles
│   ├── layout.tsx         # Root layout
│   └── page.tsx           # Main page
└── package.json
```

## 🚀 Quick Start

### Start Backend (No changes needed, just reference)
The backend C# console app is your reference. Services are now exposed through middleware.

### Start Middleware API

```bash
cd middleware
dotnet build
dotnet run
```

API runs on `http://localhost:5000`

### Start Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend runs on `http://localhost:3000`

### Open Browser

Navigate to [http://localhost:3000](http://localhost:3000)

## 🎯 MVP Workflow

1. **Credentials** - Enter Configit URL, API Key, Package Path
2. **Upload** - Drag & drop `tc_extraction.json`
3. **Processing** - Real-time 6-phase progress
4. **BOM Viewer** - Interactive tree visualization
5. **Success** - Redirects to Configit

## 🌟 Features

✨ **Real-time Streaming** - Server-Sent Events for live progress  
🎨 **Beautiful UI** - Glassmorphism with Framer Motion animations  
📊 **BOM Visualization** - Collapsible tree view  
🔄 **6-Phase Pipeline** - Parse → Validate → Transform → Upload → Compile → Complete  
📱 **Responsive Design** - Works on all devices  

## 📡 API Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/pipeline/start` | Start ETL pipeline |
| GET | `/api/pipeline/{jobId}/status` | Get job status |
| GET | `/api/pipeline/{jobId}/stream` | Stream events (SSE) |
| GET | `/api/pipeline/{jobId}/bom` | Get transformed BOM |
| GET | `/api/pipeline/jobs/history` | Get session history |

## 🛠️ Tech Stack

### Frontend
- **Next.js 14** - React SSR framework
- **TailwindCSS** - Utility-first CSS
- **Framer Motion** - Smooth animations
- **GSAP** - Advanced animations
- **Aceternity UI** - Pre-built components
- **Axios** - HTTP client

### Middleware
- **ASP.NET Core 9** - REST API
- **C#** - Language
- **.NET Channels** - Event streaming

### Backend (Reference)
- **C#** - Language
- **Configit SDK** - ACE integration
- **TeamCenter extraction** - BOM source

## 🔌 Configuration

### Frontend (.env.local)
```env
NEXT_PUBLIC_API_URL=http://localhost:5000/api
```

### Middleware (appsettings.json)
```json
{
  "AcePlatform": {
    "Uri": "https://ttl-01.demo.configit.cloud/",
    "ApiKey": "your-api-key",
    "PackagePath": "samples/pen"
  }
}
```

## 📝 Next Steps

After MVP demo:
1. Add persistent job history (database)
2. Add authentication & multi-tenancy
3. Add batch processing
4. Add custom transformation templates
5. Add webhook notifications
6. Deploy to production (Docker, K8s)

## 🐛 Troubleshooting

**Frontend can't reach API?**
- Check `NEXT_PUBLIC_API_URL` in frontend `.env.local`
- Ensure middleware is running on port 5000
- Check CORS headers

**Pipeline fails?**
- Check credentials in `appsettings.json`
- Verify Configit instance is accessible
- Check backend logs

**BOM not showing?**
- Check if transformation phase completed
- Verify SSE stream is connected
- Check browser console for errors

## 📞 Support

For issues or questions, refer to:
- [Frontend README](frontend/README.md)
- [Middleware README](middleware/README.md)
- [Backend CODEBASE_ANALYSIS.md](backend/samples/ConfigitAceIntegration/CODEBASE_ANALYSIS.md)

## 📄 License

MIT
