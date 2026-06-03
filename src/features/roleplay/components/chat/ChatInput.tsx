import { useEffect, useRef } from "react";
import { Send, Square } from "lucide-react";

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onStop: () => void;
  isStreaming: boolean;
  disabled: boolean;
  placeholder?: string;
}

export function ChatInput({
  value,
  onChange,
  onSend,
  onStop,
  isStreaming,
  disabled,
  placeholder = "输入消息...",
}: ChatInputProps) {
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [value]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!isStreaming && !disabled && value.trim()) {
        onSend();
      }
    }
  }

  return (
    <div className="theme-input-shell flex items-end gap-3 rounded-[28px] p-3">
      <textarea
        ref={inputRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        rows={1}
        className="neo-input flex-1 max-h-40 resize-none rounded-[20px] border-0 px-4 py-3 text-sm text-ink-900 placeholder:text-ink-300 focus:outline-none disabled:opacity-50"
      />

      {isStreaming ? (
        <button onClick={onStop} className="neo-button flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full text-rose-500" title="停止生成">
          <Square className="h-4 w-4" />
        </button>
      ) : (
        <button
          onClick={onSend}
          disabled={disabled || !value.trim()}
          className="neo-button-primary flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full disabled:cursor-not-allowed disabled:opacity-40"
          title="发送（Enter）"
        >
          <Send className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
