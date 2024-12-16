# FileConcat

[FileConcat](https://fileconcat.com) is an offline-first web application that helps developers share their code with AI Language Models (like ChatGPT or Claude) efficiently. It combines multiple files and folders into a single, well-formatted document that's optimized for LLM interactions.

## Features

- **100% Offline Processing**: All file operations happen in your browser for complete privacy
- **Drag & Drop Interface**: Easy upload of files and folders
- **Smart File Handling**:
  - Supports code, configuration, and documentation files
  - Automatic file type detection
  - File size validation (max 10MB per file)
  - Hidden file filtering
- **Flexible Output**:
  - Single file or grouped by extension
  - Clear file path references
  - Markdown-formatted output
  - Project structure overview
- **File Management**:
  - Detailed processing summary
  - Sort and filter capabilities
  - File status tracking

## Supported File Types

- **Code**: `.js`, `.jsx`, `.ts`, `.tsx`, `.py`, `.java`, `.cpp`, `.c`, `.cs`, `.go`, `.rb`, `.php`, `.swift`, `.kt`, `.rs`
- **Web**: `.html`, `.css`, `.scss`, `.sass`, `.less`, `.svg`, `.json`, `.xml`, `.yaml`, `.yml`
- **Documentation**: `.md`, `.txt`, `.rtf`, `.csv`, `.log`
- **Configuration**: `.env`, `.ini`, `.conf`, `.properties`
- **Shell Scripts**: `.sh`, `.ps1`
- **Other**: Configuration files without extensions (e.g., `.gitignore`)

## Development

### Prerequisites

- Node.js 18+ 
- pnpm (recommended) or npm

### Setup

1. Clone the repository:
```bash
git clone https://github.com/yourusername/fileconcat.git
cd fileconcat
```

2. Install dependencies:
```bash
pnpm install
```

3. Start development server:
```bash
pnpm dev
```

4. Build for production:
```bash
pnpm build
```

### Tech Stack

- React 18
- TypeScript
- Vite
- Tailwind CSS
- shadcn/ui
- Lucide Icons

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request. For major changes, please open an issue first to discuss what you would like to change.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

[MIT](LICENSE)

## Security

FileConcat processes all files locally in your browser. No data is ever sent to any server. If you find a security vulnerability, please send an email to security@fileconcat.com.

## Acknowledgments

- Icons by [Lucide](https://lucide.dev)
- UI Components by [shadcn/ui](https://ui.shadcn.com)

---

Made with ❤️ for the AI community

[Visit FileConcat](https://fileconcat.com) | [Report an Issue](https://github.com/yourusername/fileconcat/issues)