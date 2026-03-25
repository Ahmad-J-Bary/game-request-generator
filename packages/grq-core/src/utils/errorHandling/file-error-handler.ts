// ===== File System Error Handling =====

import { AppError } from './api-error-handler';

export class FileErrorHandler {
  /**
   * Handle file read errors
   */
  static handleFileReadError(filePath: string, error: any): AppError {
    return {
      code: 'FILE_READ_ERROR',
      message: `Failed to read file: ${filePath}`,
      details: { filePath, originalError: error },
      timestamp: new Date(),
    };
  }

  /**
   * Handle file write errors
   */
  static handleFileWriteError(filePath: string, error: any): AppError {
    return {
      code: 'FILE_WRITE_ERROR',
      message: `Failed to write file: ${filePath}`,
      details: { filePath, originalError: error },
      timestamp: new Date(),
    };
  }

  /**
   * Handle file not found errors
   */
  static handleFileNotFoundError(filePath: string): AppError {
    return {
      code: 'FILE_NOT_FOUND_ERROR',
      message: `File not found: ${filePath}`,
      details: { filePath },
      timestamp: new Date(),
    };
  }

  /**
   * Handle Excel parsing errors
   */
  static handleExcelParseError(fileName: string, error: any): AppError {
    return {
      code: 'EXCEL_PARSE_ERROR',
      message: `Failed to parse Excel file: ${fileName}`,
      details: { fileName, originalError: error },
      timestamp: new Date(),
    };
  }

  /**
   * Handle file permission errors
   */
  static handlePermissionError(filePath: string, operation: string): AppError {
    return {
      code: 'FILE_PERMISSION_ERROR',
      message: `Permission denied for ${operation}: ${filePath}`,
      details: { filePath, operation },
      timestamp: new Date(),
    };
  }
}
