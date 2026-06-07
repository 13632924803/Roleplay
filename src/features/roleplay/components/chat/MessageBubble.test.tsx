import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MessageBubble } from "./MessageBubble";
import type { ChatMessage } from "../../providers/provider.types";

describe("MessageBubble", () => {
  it("renders assistant message content", () => {
    const message: ChatMessage = { role: "assistant", content: "你好呀" };
    render(<MessageBubble message={message} index={0} />);
    expect(screen.getByText("你好呀")).toBeInTheDocument();
  });

  it("renders user message content", () => {
    const message: ChatMessage = { role: "user", content: "在吗" };
    render(<MessageBubble message={message} index={1} />);
    expect(screen.getByText("在吗")).toBeInTheDocument();
  });
});
