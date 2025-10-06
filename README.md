# Audit

A modern desktop application for managing and analyzing system logs and events. Built with Electron, React, and TypeScript.

## Features

- Real-time log monitoring
- Advanced search and filtering
- Customizable dashboards
- Cross-platform support (Windows, macOS, Linux)
- Dark/Light theme support

## Prerequisites

- Node.js 16.x or later
- npm or yarn
- Python 3.7+ (for certain integrations)

## Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/TheNotoriousCompa/Audit.git
   cd Audit
   ```

2. Install dependencies:
   ```bash
   npm install
   # or
   yarn
   ```

3. Start the development server:
   ```bash
   npm run dev
   # or
   yarn dev
   ```

## Building for Production

To create a production build:

```bash
# Create production build
npm run build
# or
yarn build

# Package the application
npm run package
# or
yarn package
```

## Project Structure

```
Audit/
├── src/                    # Source files
│   ├── main/               # Electron main process
│   ├── renderer/           # React application
│   └── types/              # TypeScript type definitions
├── scripts/                # Build and utility scripts
└── python/                 # Python backend services
```

## Contributing

Contributions are welcome! Please read our [contributing guidelines](CONTRIBUTING.md) before submitting pull requests.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

For support, please open an issue in the [GitHub repository](https://github.com/TheNotoriousCompa/Audit/issues).
