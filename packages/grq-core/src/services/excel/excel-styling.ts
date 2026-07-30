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
export function getNoFillStyle(theme: 'light' | 'dark', isHeader: boolean = false) {
  const textColor = theme === 'dark' ? 'FFFFFF' : '000000';
  return {
    font: { color: { rgb: textColor }, bold: isHeader },
    border: {
      top: { style: 'thin', color: { auto: 1 } },
      bottom: { style: 'thin', color: { auto: 1 } },
      left: { style: 'thin', color: { auto: 1 } },
      right: { style: 'thin', color: { auto: 1 } },
    },
    alignment: { horizontal: 'center', vertical: 'center' }
  };
}

export function getCellStyle(backgroundColor: string, theme: 'light' | 'dark', isHeader: boolean = false, isSynthetic: boolean = false) {
  let finalBgColor = rgbToHex(backgroundColor);
  
  // Parse RGB for blending
  const match = backgroundColor.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
  if (match) {
    let r = parseInt(match[1]);
    let g = parseInt(match[2]);
    let b = parseInt(match[3]);
    const darkR = 30, darkG = 30, darkB = 30;

    if (isSynthetic) {
      // More transparent: blend with 30% white/dark to lighten
      if (theme === 'light') {
        r = Math.round(r * 0.7 + 255 * 0.3);
        g = Math.round(g * 0.7 + 255 * 0.3);
        b = Math.round(b * 0.7 + 255 * 0.3);
      } else {
        r = Math.round(r * 0.7 + darkR * 0.3);
        g = Math.round(g * 0.7 + darkG * 0.3);
        b = Math.round(b * 0.7 + darkB * 0.3);
      }
    } else {
      // Slightly darker: blend with 10% dark gray to contrast
      r = Math.round(r * 0.9 + darkR * 0.1);
      g = Math.round(g * 0.9 + darkG * 0.1);
      b = Math.round(b * 0.9 + darkB * 0.1);
    }

    const toHex = (c: number) => `0${c.toString(16)}`.slice(-2);
    finalBgColor = `${toHex(r)}${toHex(g)}${toHex(b)}`;
  }

  return {
    fill: { fgColor: { rgb: finalBgColor } },
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

