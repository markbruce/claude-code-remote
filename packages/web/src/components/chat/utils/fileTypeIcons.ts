/**
 * File type to icon mapping
 * Returns appropriate icon based on file extension
 */

export type FileIconInfo = {
  icon: string;
  color: string;
  label: string;
};

const ICON_BY_EXTENSION: Record<string, FileIconInfo> = {
  // JavaScript/TypeScript
  js: { icon: 'JS', color: 'text-yellow-500', label: 'JavaScript' },
  jsx: { icon: ' JSX', color: 'text-blue-400', label: 'React' },
  ts: { icon: 'TS', color: 'text-blue-600', label: 'TypeScript' },
  tsx: { icon: 'TSX', color: 'text-blue-500', label: 'React TypeScript' },
  mjs: { icon: 'MJS', color: 'text-yellow-500', label: 'ES Module' },
  cjs: { icon: 'CJS', color: 'text-yellow-600', label: 'CommonJS' },

  // Web
  html: { icon: 'HTML', color: 'text-orange-500', label: 'HTML' },
  css: { icon: 'CSS', color: 'text-blue-500', label: 'CSS' },
  scss: { icon: 'SCSS', color: 'text-pink-500', label: 'SCSS' },
  sass: { icon: 'SASS', color: 'text-pink-500', label: 'Sass' },
  less: { icon: 'LESS', color: 'text-indigo-500', label: 'Less' },
  vue: { icon: 'VUE', color: 'text-green-500', label: 'Vue' },
  svelte: { icon: 'SVE', color: 'text-orange-500', label: 'Svelte' },

  // Data/Config
  json: { icon: 'JSON', color: 'text-yellow-500', label: 'JSON' },
  yaml: { icon: 'YML', color: 'text-red-400', label: 'YAML' },
  yml: { icon: 'YML', color: 'text-red-400', label: 'YAML' },
  xml: { icon: 'XML', color: 'text-orange-500', label: 'XML' },
  toml: { icon: 'TOML', color: 'text-gray-500', label: 'TOML' },
  ini: { icon: 'INI', color: 'text-gray-500', label: 'INI' },
  env: { icon: 'ENV', color: 'text-yellow-600', label: 'Environment' },

  // Backend
  py: { icon: 'PY', color: 'text-blue-400', label: 'Python' },
  rb: { icon: 'RB', color: 'text-red-500', label: 'Ruby' },
  go: { icon: 'GO', color: 'text-cyan-500', label: 'Go' },
  rs: { icon: 'RS', color: 'text-orange-600', label: 'Rust' },
  java: { icon: 'JAVA', color: 'text-red-500', label: 'Java' },
  kt: { icon: 'KT', color: 'text-purple-500', label: 'Kotlin' },
  php: { icon: 'PHP', color: 'text-indigo-500', label: 'PHP' },
  cs: { icon: 'CS', color: 'text-green-600', label: 'C#' },
  swift: { icon: 'SWIFT', color: 'text-orange-500', label: 'Swift' },

  // Systems
  c: { icon: 'C', color: 'text-blue-600', label: 'C' },
  cpp: { icon: 'C++', color: 'text-blue-600', label: 'C++' },
  h: { icon: 'H', color: 'text-purple-500', label: 'Header' },
  hpp: { icon: 'HPP', color: 'text-purple-500', label: 'C++ Header' },

  // Shell
  sh: { icon: 'SH', color: 'text-green-500', label: 'Shell' },
  bash: { icon: 'BASH', color: 'text-green-500', label: 'Bash' },
  zsh: { icon: 'ZSH', color: 'text-green-500', label: 'Zsh' },
  fish: { icon: 'FISH', color: 'text-green-500', label: 'Fish' },

  // Markup
  md: { icon: 'MD', color: 'text-gray-500', label: 'Markdown' },
  mdx: { icon: 'MDX', color: 'text-purple-500', label: 'MDX' },
  rst: { icon: 'RST', color: 'text-gray-500', label: 'reStructuredText' },
  tex: { icon: 'TEX', color: 'text-gray-600', label: 'LaTeX' },

  // Database
  sql: { icon: 'SQL', color: 'text-blue-500', label: 'SQL' },
  prisma: { icon: 'PRISMA', color: 'text-indigo-500', label: 'Prisma' },
  graphql: { icon: 'GQL', color: 'text-pink-500', label: 'GraphQL' },
  gql: { icon: 'GQL', color: 'text-pink-500', label: 'GraphQL' },

  // Docker/CI
  dockerfile: { icon: 'DOCKER', color: 'text-blue-500', label: 'Docker' },
  dockerignore: { icon: 'DOCKER', color: 'text-blue-500', label: 'Docker Ignore' },
  gitignore: { icon: 'GIT', color: 'text-orange-500', label: 'Git Ignore' },
  github: { icon: 'GITHUB', color: 'text-gray-600', label: 'GitHub' },
  gitlab: { icon: 'GITLAB', color: 'text-orange-500', label: 'GitLab' },

  // Lock files
  lock: { icon: 'LOCK', color: 'text-gray-500', label: 'Lock File' },

  // Image
  png: { icon: 'PNG', color: 'text-purple-500', label: 'PNG Image' },
  jpg: { icon: 'JPG', color: 'text-purple-500', label: 'JPEG Image' },
  jpeg: { icon: 'JPG', color: 'text-purple-500', label: 'JPEG Image' },
  gif: { icon: 'GIF', color: 'text-purple-500', label: 'GIF Image' },
  svg: { icon: 'SVG', color: 'text-orange-500', label: 'SVG Image' },
  ico: { icon: 'ICO', color: 'text-purple-500', label: 'Icon' },

  // Other
  txt: { icon: 'TXT', color: 'text-gray-500', label: 'Text' },
  log: { icon: 'LOG', color: 'text-gray-500', label: 'Log' },
  map: { icon: 'MAP', color: 'text-gray-500', label: 'Source Map' },
};

const DEFAULT_FILE_ICON: FileIconInfo = {
  icon: 'FILE',
  color: 'text-gray-400',
  label: 'File',
};

const FOLDER_ICON: FileIconInfo = {
  icon: 'DIR',
  color: 'text-yellow-500',
  label: 'Directory',
};

export function getFileIcon(filename: string, isDirectory = false): FileIconInfo {
  if (isDirectory) return FOLDER_ICON;

  const ext = filename.split('.').pop()?.toLowerCase() || '';

  // Check for special filenames
  const baseName = filename.toLowerCase();
  if (baseName === 'dockerfile') return ICON_BY_EXTENSION['dockerfile'];
  if (baseName === '.dockerignore') return ICON_BY_EXTENSION['dockerignore'];
  if (baseName === '.gitignore') return ICON_BY_EXTENSION['gitignore'];
  if (baseName === 'package.json') return { icon: 'PKG', color: 'text-red-500', label: 'Package' };
  if (baseName === 'tsconfig.json') return { icon: 'TS', color: 'text-blue-600', label: 'TypeScript Config' };
  if (baseName === '.env' || baseName.startsWith('.env.')) return ICON_BY_EXTENSION['env'];
  if (baseName === 'readme.md') return { icon: 'README', color: 'text-blue-500', label: 'README' };
  if (baseName === 'license' || baseName === 'license.md') return { icon: 'LIC', color: 'text-gray-500', label: 'License' };
  if (baseName === 'makefile') return { icon: 'MAKE', color: 'text-orange-500', label: 'Makefile' };

  return ICON_BY_EXTENSION[ext] || DEFAULT_FILE_ICON;
}

export function getLanguageFromPath(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() || '';

  const langMap: Record<string, string> = {
    js: 'javascript',
    jsx: 'jsx',
    ts: 'typescript',
    tsx: 'tsx',
    mjs: 'javascript',
    cjs: 'javascript',
    html: 'html',
    css: 'css',
    scss: 'scss',
    sass: 'sass',
    less: 'less',
    json: 'json',
    yaml: 'yaml',
    yml: 'yaml',
    xml: 'xml',
    md: 'markdown',
    mdx: 'mdx',
    py: 'python',
    rb: 'ruby',
    go: 'go',
    rs: 'rust',
    java: 'java',
    kt: 'kotlin',
    php: 'php',
    cs: 'csharp',
    swift: 'swift',
    c: 'c',
    cpp: 'cpp',
    h: 'c',
    hpp: 'cpp',
    sh: 'bash',
    bash: 'bash',
    zsh: 'bash',
    sql: 'sql',
    graphql: 'graphql',
    gql: 'graphql',
    toml: 'toml',
    ini: 'ini',
    txt: 'text',
    log: 'text',
  };

  return langMap[ext] || 'text';
}
