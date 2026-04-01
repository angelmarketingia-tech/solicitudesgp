# Guía para subir "Agente A9" a GitHub

Para subir tu proyecto correctamente a GitHub y evitar archivos pesados o sensibles (como claves API), sigue estos pasos:

### 1. Archivo `.gitignore` en la Raíz
Carga solo lo necesario y protege tus claves. Crea un archivo llamado `.gitignore` en la carpeta `Agente A9`:

```gitignore
node_modules/
app/node_modules/
.next/
app/.next/
out/
build/
app/build/
*.tsbuildinfo
next-env.d.ts
.env
.env.local
.env.production
*.env*
app/.env*
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*
.pnpm-debug.log*
ngrok.log
.DS_Store
.vscode/
.idea/
*.pem
```

### 2. Comandos en la Terminal
Ejecuta esto desde la carpeta `Agente A9`:

```powershell
# 1. Iniciar el repositorio de git
git init

# 2. Añadir todos los archivos
git add .

# 3. Guardar el progreso inicial
git commit -m "🚀 Initial commit: GanaPlay Smart Dashboard with AI & Ref Photos"

# 4. Conecta tu repositorio de GitHub (Sustituye la URL por la tuya):
# git remote add origin https://github.com/TU_USUARIO/TU_REPOSITORIO.git
# git branch -M main
# git push -u origin main
```

### 🧠 ¿Qué archivos son los más importantes?
- **`app/src/`**: Todo tu código de React/Next.js (el cerebro del app).
- **`app/package.json`**: Las librerías que usa el proyecto (Next.js, Tailwind, etc.).
- **`app/public/`**: Logos e iconos.
- **`logo/`**: Cualquier asset original que guardes allí.

> [!CAUTION]
> **NUNCA** subas el archivo `.env.local` si tiene llaves de OpenAI. He añadido reglas al `.gitignore` para saltárselo.
