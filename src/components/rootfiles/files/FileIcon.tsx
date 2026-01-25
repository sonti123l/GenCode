// components/FileIcon.tsx
import {
  VscFile,
  VscFolder,
  VscFolderOpened,
  VscJson,
} from "react-icons/vsc";
import {
  SiJavascript,
  SiTypescript,
  SiReact,
  SiPython,
  SiRust,
  SiHtml5,
  SiCss3,
  SiNodedotjs,
  SiGo,
  SiCplusplus,
  SiC,
  SiPhp,
  SiRuby,
  SiSwift,
  SiKotlin,
  SiDart,
  SiPerl,
  SiLua,
  SiR,
  SiScala,
  SiElixir,
  SiHaskell,
  SiClojure,
  SiErlang,
  SiVuedotjs,
  SiSvelte,
  SiSass,
  SiLess,
  SiTailwindcss,
  SiWebpack,
  SiVite,
  SiDocker,
  SiGit,
  SiYaml,
  SiToml,
  SiNpm,
  SiYarn,
  SiPnpm,
  SiMarkdown,
  SiGraphql,
  SiPostgresql,
  SiSqlite,
} from "react-icons/si";
import {
  FaFileImage,
  FaFilePdf,
  FaFileArchive,
  FaFileVideo,
  FaFileAudio,
  FaFileWord,
  FaFileExcel,
  FaFilePowerpoint,
  FaFileCode,
} from "react-icons/fa";
import { JSX } from "react";

interface FileIconProps {
  fileName: string;
  isDirectory: boolean;
  isOpen?: boolean;
}

export function FileIcon({
  fileName,
  isDirectory,
  isOpen = false,
}: FileIconProps) {
  if (isDirectory) {
    return isOpen ? (
      <VscFolderOpened className="h-4 w-4 text-yellow-500" />
    ) : (
      <VscFolder className="h-4 w-4 text-yellow-500" />
    );
  }

  const extension = fileName.split(".").pop()?.toLowerCase();
  const fullName = fileName.toLowerCase();

  const iconMap: Record<string, JSX.Element> = {
    js: <SiJavascript className="h-4 w-4 text-yellow-400" />,
    mjs: <SiJavascript className="h-4 w-4 text-yellow-400" />,
    cjs: <SiJavascript className="h-4 w-4 text-yellow-400" />,
    jsx: <SiReact className="h-4 w-4 text-cyan-400" />,
    ts: <SiTypescript className="h-4 w-4 text-blue-500" />,
    tsx: <SiReact className="h-4 w-4 text-blue-400" />,

    html: <SiHtml5 className="h-4 w-4 text-orange-500" />,
    htm: <SiHtml5 className="h-4 w-4 text-orange-500" />,
    css: <SiCss3 className="h-4 w-4 text-blue-500" />,
    scss: <SiSass className="h-4 w-4 text-pink-500" />,
    sass: <SiSass className="h-4 w-4 text-pink-500" />,
    less: <SiLess className="h-4 w-4 text-blue-600" />,
    vue: <SiVuedotjs className="h-4 w-4 text-green-500" />,
    svelte: <SiSvelte className="h-4 w-4 text-orange-600" />,

    json: <VscJson className="h-4 w-4 text-yellow-500" />,
    yaml: <SiYaml className="h-4 w-4 text-red-500" />,
    yml: <SiYaml className="h-4 w-4 text-red-500" />,
    toml: <SiToml className="h-4 w-4 text-gray-400" />,
    xml: <FaFileCode className="h-4 w-4 text-orange-400" />,
    ini: <FaFileCode className="h-4 w-4 text-gray-400" />,
    env: <FaFileCode className="h-4 w-4 text-yellow-600" />,

    md: <SiMarkdown className="h-4 w-4 text-blue-400" />,
    mdx: <SiMarkdown className="h-4 w-4 text-blue-400" />,
    txt: <VscFile className="h-4 w-4 text-gray-400" />,
    pdf: <FaFilePdf className="h-4 w-4 text-red-500" />,

    py: <SiPython className="h-4 w-4 text-blue-400" />,
    pyc: <SiPython className="h-4 w-4 text-blue-400" />,
    pyw: <SiPython className="h-4 w-4 text-blue-400" />,
    rs: <SiRust className="h-4 w-4 text-orange-600" />,
    go: <SiGo className="h-4 w-4 text-cyan-500" />,
    cpp: <SiCplusplus className="h-4 w-4 text-blue-600" />,
    cc: <SiCplusplus className="h-4 w-4 text-blue-600" />,
    cxx: <SiCplusplus className="h-4 w-4 text-blue-600" />,
    c: <SiC className="h-4 w-4 text-blue-700" />,
    h: <SiC className="h-4 w-4 text-purple-500" />,
    hpp: <SiCplusplus className="h-4 w-4 text-purple-500" />,
    php: <SiPhp className="h-4 w-4 text-indigo-500" />,
    rb: <SiRuby className="h-4 w-4 text-red-600" />,
    swift: <SiSwift className="h-4 w-4 text-orange-500" />,
    kt: <SiKotlin className="h-4 w-4 text-purple-500" />,
    kts: <SiKotlin className="h-4 w-4 text-purple-500" />,
    dart: <SiDart className="h-4 w-4 text-blue-500" />,
    pl: <SiPerl className="h-4 w-4 text-blue-400" />,
    lua: <SiLua className="h-4 w-4 text-blue-600" />,
    r: <SiR className="h-4 w-4 text-blue-500" />,
    scala: <SiScala className="h-4 w-4 text-red-600" />,
    ex: <SiElixir className="h-4 w-4 text-purple-500" />,
    exs: <SiElixir className="h-4 w-4 text-purple-500" />,
    hs: <SiHaskell className="h-4 w-4 text-purple-600" />,
    clj: <SiClojure className="h-4 w-4 text-green-600" />,
    erl: <SiErlang className="h-4 w-4 text-red-500" />,

    bat: <FaFileCode className="h-4 w-4 text-green-600" />,
    cmd: <FaFileCode className="h-4 w-4 text-green-600" />,

    png: <FaFileImage className="h-4 w-4 text-purple-400" />,
    jpg: <FaFileImage className="h-4 w-4 text-purple-400" />,
    jpeg: <FaFileImage className="h-4 w-4 text-purple-400" />,
    gif: <FaFileImage className="h-4 w-4 text-purple-400" />,
    svg: <FaFileImage className="h-4 w-4 text-yellow-400" />,
    webp: <FaFileImage className="h-4 w-4 text-purple-400" />,
    ico: <FaFileImage className="h-4 w-4 text-blue-400" />,
    bmp: <FaFileImage className="h-4 w-4 text-purple-400" />,

    mp4: <FaFileVideo className="h-4 w-4 text-pink-500" />,
    avi: <FaFileVideo className="h-4 w-4 text-pink-500" />,
    mov: <FaFileVideo className="h-4 w-4 text-pink-500" />,
    mkv: <FaFileVideo className="h-4 w-4 text-pink-500" />,
    webm: <FaFileVideo className="h-4 w-4 text-pink-500" />,

    mp3: <FaFileAudio className="h-4 w-4 text-cyan-500" />,
    wav: <FaFileAudio className="h-4 w-4 text-cyan-500" />,
    flac: <FaFileAudio className="h-4 w-4 text-cyan-500" />,
    ogg: <FaFileAudio className="h-4 w-4 text-cyan-500" />,
    m4a: <FaFileAudio className="h-4 w-4 text-cyan-500" />,

    zip: <FaFileArchive className="h-4 w-4 text-yellow-600" />,
    rar: <FaFileArchive className="h-4 w-4 text-yellow-600" />,
    "7z": <FaFileArchive className="h-4 w-4 text-yellow-600" />,
    tar: <FaFileArchive className="h-4 w-4 text-yellow-600" />,
    gz: <FaFileArchive className="h-4 w-4 text-yellow-600" />,

    doc: <FaFileWord className="h-4 w-4 text-blue-600" />,
    docx: <FaFileWord className="h-4 w-4 text-blue-600" />,
    xls: <FaFileExcel className="h-4 w-4 text-green-600" />,
    xlsx: <FaFileExcel className="h-4 w-4 text-green-600" />,
    ppt: <FaFilePowerpoint className="h-4 w-4 text-orange-600" />,
    pptx: <FaFilePowerpoint className="h-4 w-4 text-orange-600" />,

    sql: <SiPostgresql className="h-4 w-4 text-blue-500" />,
    db: <SiSqlite className="h-4 w-4 text-blue-400" />,
    sqlite: <SiSqlite className="h-4 w-4 text-blue-400" />,

    graphql: <SiGraphql className="h-4 w-4 text-pink-500" />,
    gql: <SiGraphql className="h-4 w-4 text-pink-500" />,

    dockerfile: <SiDocker className="h-4 w-4 text-blue-500" />,

    gitignore: <SiGit className="h-4 w-4 text-orange-600" />,
    gitattributes: <SiGit className="h-4 w-4 text-orange-600" />,
  };

  const specialFiles: Record<string, JSX.Element> = {
    "package.json": <SiNodedotjs className="h-4 w-4 text-green-500" />,
    "package-lock.json": <SiNpm className="h-4 w-4 text-red-500" />,
    "yarn.lock": <SiYarn className="h-4 w-4 text-blue-400" />,
    "pnpm-lock.yaml": <SiPnpm className="h-4 w-4 text-yellow-500" />,
    "tsconfig.json": <SiTypescript className="h-4 w-4 text-blue-500" />,
    "webpack.config.js": <SiWebpack className="h-4 w-4 text-blue-400" />,
    "vite.config.js": <SiVite className="h-4 w-4 text-purple-500" />,
    "vite.config.ts": <SiVite className="h-4 w-4 text-purple-500" />,
    "tailwind.config.js": <SiTailwindcss className="h-4 w-4 text-cyan-400" />,
    dockerfile: <SiDocker className="h-4 w-4 text-blue-500" />,
    "docker-compose.yml": <SiDocker className="h-4 w-4 text-blue-500" />,
    ".gitignore": <SiGit className="h-4 w-4 text-orange-600" />,
    ".env": <FaFileCode className="h-4 w-4 text-yellow-600" />,
    ".env.local": <FaFileCode className="h-4 w-4 text-yellow-600" />,
    "readme.md": <SiMarkdown className="h-4 w-4 text-blue-400" />,
    "cargo.toml": <SiRust className="h-4 w-4 text-orange-600" />,
  };

  if (specialFiles[fullName]) {
    return specialFiles[fullName];
  }

  return (
    iconMap[extension || ""] || <VscFile className="h-4 w-4 text-gray-400" />
  );
}
