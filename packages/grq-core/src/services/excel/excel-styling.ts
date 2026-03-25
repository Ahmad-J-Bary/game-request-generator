// ===== Excel Styling Utilities =====

/**
 * Helper function to parse RGB and get hex for Excel
 */
export function rgbToHex(rgb: string): string {
  const match = rgb.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
  if (!match) return 'FFFFFF';
  const toHex = (c: number) => `0${c.toString(16)}`.slice(-2);
  return `${toHex(Number(match[1]))}${toHex(Number(match[2]))}${toHex(Number(match[3]))}`;
}

/**
 * Helper function to get text color based on background
 */
export function getTextColor(backgroundColor: string, theme: 'light' | 'dark'): string {
  const rgb = backgroundColor.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
  if (!rgb) return theme === 'dark' ? 'FFFFFF' : '000000';

  const r = parseInt(rgb[1]);
  const g = parseInt(rgb[2]);
  const b = parseInt(rgb[3]);

  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance < 0.5 ? 'FFFFFF' : '000000';
}

/**
 * Helper function to get cell style for Excel
 */
export function getCellStyle(backgroundColor: string, theme: 'light' | 'dark', isHeader: boolean = false, isSynthetic: boolean = false) {
  return {
    fill: { fgColor: { rgb: rgbToHex(backgroundColor) } },
    font: {
      color: { rgb: getTextColor(backgroundColor, theme) },
      bold: isHeader,
      italic: isSynthetic,
    },
    border: {
      top: { style: 'thin', color: { auto: 1 } },
      bottom: { style: 'thin', color: { auto: 1 } },
      left: { style: 'thin', color: { auto: 1 } },
      right: { style: 'thin', color: { auto: 1 } },
    },
    alignment: {
      horizontal: 'center',
      vertical: 'center'
    }
  };
}

