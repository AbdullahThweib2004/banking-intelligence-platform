import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import SignatureCanvas from 'react-signature-canvas';
import { Eraser, PenLine, Type } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

export interface SignaturePadHandle {
  /** PNG data URL, or null when empty. */
  getDataUrl: () => string | null;
  isEmpty: () => boolean;
  clear: () => void;
}

export interface SignaturePadProps {
  label: string;
  hint?: string;
  /** When true, user may switch between drawing and typed name (employee only). */
  allowTypedName?: boolean;
  typedNamePlaceholder?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
}

const CANVAS_WIDTH = 520;
const CANVAS_HEIGHT = 140;

function renderTypedNameToDataUrl(text: string): string {
  const canvas = document.createElement('canvas');
  canvas.width = CANVAS_WIDTH;
  canvas.height = CANVAS_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#111827';
  ctx.font = 'italic 36px "Segoe Script", "Brush Script MT", "DejaVu Sans", cursive';
  ctx.textBaseline = 'middle';
  ctx.fillText(text.trim(), 20, canvas.height / 2);

  return canvas.toDataURL('image/png');
}

const SignaturePad = forwardRef<SignaturePadHandle, SignaturePadProps>(
  (
    {
      label,
      hint,
      allowTypedName = false,
      typedNamePlaceholder = '',
      required = false,
      disabled = false,
      className,
    },
    ref
  ) => {
    const padRef = useRef<SignatureCanvas>(null);
    const [mode, setMode] = useState<'draw' | 'type'>(allowTypedName ? 'draw' : 'draw');
    const [typedName, setTypedName] = useState('');
    const [typedApplied, setTypedApplied] = useState(false);

    const getDrawnDataUrl = useCallback((): string | null => {
      const pad = padRef.current;
      if (!pad || pad.isEmpty()) return null;
      return pad.toDataURL('image/png');
    }, []);

    const getTypedDataUrl = useCallback((): string | null => {
      if (!typedApplied || !typedName.trim()) return null;
      return renderTypedNameToDataUrl(typedName);
    }, [typedApplied, typedName]);

    useImperativeHandle(
      ref,
      () => ({
        getDataUrl: () => {
          if (allowTypedName && mode === 'type') {
            return getTypedDataUrl();
          }
          return getDrawnDataUrl();
        },
        isEmpty: () => {
          if (allowTypedName && mode === 'type') {
            return !typedApplied || !typedName.trim();
          }
          const pad = padRef.current;
          return !pad || pad.isEmpty();
        },
        clear: () => {
          padRef.current?.clear();
          setTypedName('');
          setTypedApplied(false);
        },
      }),
      [allowTypedName, mode, getDrawnDataUrl, getTypedDataUrl]
    );

    const handleClear = () => {
      padRef.current?.clear();
      setTypedApplied(false);
    };

    const handleApplyTyped = () => {
      if (!typedName.trim()) return;
      setTypedApplied(true);
      padRef.current?.clear();
    };

    const switchMode = (next: 'draw' | 'type') => {
      setMode(next);
      if (next === 'draw') {
        setTypedApplied(false);
      } else {
        padRef.current?.clear();
      }
    };

    return (
      <div className={cn('space-y-2', className)}>
        <div className="flex items-center justify-between gap-2">
          <Label>
            {label}
            {required && <span className="text-destructive ms-1">*</span>}
          </Label>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 gap-1 text-muted-foreground"
            onClick={handleClear}
            disabled={disabled}
          >
            <Eraser className="h-3.5 w-3.5" />
            Clear
          </Button>
        </div>

        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}

        {allowTypedName && (
          <div className="flex gap-1 rounded-lg border border-border p-1 bg-muted/30">
            <Button
              type="button"
              size="sm"
              variant={mode === 'draw' ? 'secondary' : 'ghost'}
              className="flex-1 gap-1.5 h-8"
              onClick={() => switchMode('draw')}
              disabled={disabled}
            >
              <PenLine className="h-3.5 w-3.5" />
              Draw
            </Button>
            <Button
              type="button"
              size="sm"
              variant={mode === 'type' ? 'secondary' : 'ghost'}
              className="flex-1 gap-1.5 h-8"
              onClick={() => switchMode('type')}
              disabled={disabled}
            >
              <Type className="h-3.5 w-3.5" />
              Type name
            </Button>
          </div>
        )}

        {allowTypedName && mode === 'type' ? (
          <div className="space-y-2">
            <Input
              value={typedName}
              onChange={(e) => {
                setTypedName(e.target.value);
                setTypedApplied(false);
              }}
              placeholder={typedNamePlaceholder}
              disabled={disabled}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleApplyTyped}
              disabled={disabled || !typedName.trim()}
            >
              Apply typed signature
            </Button>
            {typedApplied && typedName.trim() && (
              <div className="rounded-md border border-dashed border-border bg-muted/20 p-3 overflow-hidden">
                <img
                  src={renderTypedNameToDataUrl(typedName)}
                  alt="Typed signature preview"
                  className="max-h-[80px] w-full object-contain object-left"
                />
              </div>
            )}
          </div>
        ) : (
          <div
            className={cn(
              'rounded-md border border-dashed border-border bg-white overflow-hidden touch-none',
              disabled && 'opacity-60 pointer-events-none'
            )}
          >
            <SignatureCanvas
              ref={padRef}
              penColor="#111827"
              canvasProps={{
                width: CANVAS_WIDTH,
                height: CANVAS_HEIGHT,
                className: 'w-full h-[140px] cursor-crosshair',
              }}
            />
          </div>
        )}
      </div>
    );
  }
);

SignaturePad.displayName = 'SignaturePad';

export default SignaturePad;
