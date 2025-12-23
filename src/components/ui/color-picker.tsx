// src/components/ui/color-picker.tsx
import { useState, useEffect } from 'react';
import { Button } from './button';
import { Input } from './input';
import { Label } from './label';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from './popover';

interface ColorPickerProps {
  color: string;
  onChange: (color: string) => void;
  label?: string;
}

const PRESET_COLORS = [
  { name: 'Light Blue', value: 'rgb(219, 234, 254)' },
  { name: 'Light Green', value: 'rgb(220, 252, 231)' },
  { name: 'Light Yellow', value: 'rgb(254, 249, 195)' },
  { name: 'Light Red', value: 'rgb(254, 226, 226)' },
  { name: 'Light Purple', value: 'rgb(243, 232, 255)' },
  { name: 'Light Pink', value: 'rgb(252, 231, 243)' },
  { name: 'Light Orange', value: 'rgb(255, 237, 213)' },
  { name: 'Light Gray', value: 'rgb(243, 244, 246)' },
  { name: 'White', value: 'rgb(255, 255, 255)' },
  { name: 'Light Cyan', value: 'rgb(207, 250, 254)' },
  { name: 'Light Lime', value: 'rgb(236, 252, 203)' },
  { name: 'Light Amber', value: 'rgb(254, 243, 199)' },
];

export function ColorPicker({ color, onChange, label }: ColorPickerProps) {
  // Ensure color is defined
  const safeColor = color || 'rgb(255, 255, 255)';
  const [r, g, b] = parseRgb(safeColor);
  const [localR, setLocalR] = useState(r);
  const [localG, setLocalG] = useState(g);
  const [localB, setLocalB] = useState(b);
  
  // Update local state when color prop changes
  useEffect(() => {
    const [newR, newG, newB] = parseRgb(safeColor);
    setLocalR(newR);
    setLocalG(newG);
    setLocalB(newB);
  }, [safeColor]);

  const handleRgbChange = () => {
    const newColor = `rgb(${localR}, ${localG}, ${localB})`;
    onChange(newColor);
  };

  const handlePresetClick = (presetColor: string) => {
    const [pr, pg, pb] = parseRgb(presetColor);
    setLocalR(pr);
    setLocalG(pg);
    setLocalB(pb);
    onChange(presetColor);
  };

  return (
    <div className="space-y-2">
      {label && <Label>{label}</Label>}
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className="w-full justify-start text-left font-normal"
          >
            <div
              className="mr-2 h-4 w-4 rounded border"
              style={{ backgroundColor: color }}
            />
            <span className="flex-1">{color}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80">
          <div className="space-y-4">
            <div>
              <h4 className="font-medium mb-3">Preset Colors</h4>
              <div className="grid grid-cols-4 gap-2">
                {PRESET_COLORS.map((preset) => (
                  <button
                    key={preset.name}
                    onClick={() => handlePresetClick(preset.value)}
                    className="h-10 rounded border-2 hover:border-primary transition-colors"
                    style={{ backgroundColor: preset.value }}
                    title={preset.name}
                  />
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <h4 className="font-medium">Custom RGB</h4>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Label className="w-8">R:</Label>
                  <Input
                    type="number"
                    min="0"
                    max="255"
                    value={localR}
                    onChange={(e) => setLocalR(Number(e.target.value))}
                    className="flex-1"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Label className="w-8">G:</Label>
                  <Input
                    type="number"
                    min="0"
                    max="255"
                    value={localG}
                    onChange={(e) => setLocalG(Number(e.target.value))}
                    className="flex-1"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Label className="w-8">B:</Label>
                  <Input
                    type="number"
                    min="0"
                    max="255"
                    value={localB}
                    onChange={(e) => setLocalB(Number(e.target.value))}
                    className="flex-1"
                  />
                </div>
                <Button onClick={handleRgbChange} className="w-full">
                  Apply RGB
                </Button>
              </div>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

function parseRgb(color: string | undefined): [number, number, number] {
  // Handle undefined or null color
  if (!color) {
    return [255, 255, 255];
  }
  
  const match = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
  if (match) {
    return [Number(match[1]), Number(match[2]), Number(match[3])];
  }
  
  // Try to parse hex color
  const hexMatch = color.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
  if (hexMatch) {
    return [
      parseInt(hexMatch[1], 16),
      parseInt(hexMatch[2], 16),
      parseInt(hexMatch[3], 16)
    ];
  }
  
  // If format is not recognized, return default white
  return [255, 255, 255];
}