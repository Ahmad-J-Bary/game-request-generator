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
  let finalBgColor = rgbToHex(backgroundColor);
  
  if (isSynthetic) {
    // Parse RGB to blend it
    const match = backgroundColor.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    if (match) {
      let r = parseInt(match[1]);
      let g = parseInt(match[2]);
      let b = parseInt(match[3]);
      
      if (theme === 'light') {
        // Blend with white (80% opacity equivalent)
        r = Math.round(r * 0.2 + 255 * 0.8);
        g = Math.round(g * 0.2 + 255 * 0.8);
        b = Math.round(b * 0.2 + 255 * 0.8);
      } else {
        // Blend with dark background (50% opacity equivalent)
        const darkR = 30, darkG = 30, darkB = 30;
        r = Math.round(r * 0.5 + darkR * 0.5);
        g = Math.round(g * 0.5 + darkG * 0.5);
        b = Math.round(b * 0.5 + darkB * 0.5);
      }
      
      const toHex = (c: number) => `0${c.toString(16)}`.slice(-2);
      finalBgColor = `${toHex(r)}${toHex(g)}${toHex(b)}`;
    }
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

