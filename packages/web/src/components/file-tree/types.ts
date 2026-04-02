export interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: FileNode[];
  extension?: string;
}

export interface FileTreeProps {
  rootPath: string;
  machineId?: string;
  /** 单击文件时调用 - 预览模式 */
  onFileSelect: (path: string) => void;
  /** 双击文件时调用 - 固定标签 */
  onFileDoubleClick?: (path: string) => void;
  selectedFile?: string;
  maxHeight?: string;
}
