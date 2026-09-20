import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ChatPage from "@/app/(main)/chat/page";

// The client must handle both wire formats: SSE when AGENT_MODE is on, and the
// original plain-text stream when it is off.
function streamResponse(contentType: string, ...chunks: string[]) {
  const encoder = new TextEncoder();
  return {
    ok: true,
    headers: { get: () => contentType },
    body: new ReadableStream({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
        controller.close();
      },
    }),
  } as unknown as Response;
}

async function ask(question = "How does my team look?") {
  const user = userEvent.setup();
  render(<ChatPage />);
  await user.type(screen.getByRole("textbox"), question);
  await user.keyboard("{Enter}");
}

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => vi.restoreAllMocks());

describe("the Coach chat client", () => {
  it("renders plain-text streams unchanged when the agent is off", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(streamResponse("text/plain; charset=utf-8", "Start ", "Green."))
    );
    await ask();
    await waitFor(() => expect(screen.getByText("Start Green.")).toBeInTheDocument());
  });

  it("shows agent steps and the answer from SSE frames", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        streamResponse(
          "text/event-stream; charset=utf-8",
          'data: {"type":"agent_step","action":"get_roster"}\n\n',
          'data: {"type":"text","delta":"Start "}\n\ndata: {"type":"text","delta":"Green."}\n\n'
        )
      )
    );
    await ask();
    await waitFor(() => expect(screen.getByText("Reading your roster...")).toBeInTheDocument());
    expect(screen.getByText("Start Green.")).toBeInTheDocument();
  });

  it("reassembles a frame split across two network chunks", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        streamResponse(
          "text/event-stream; charset=utf-8",
          'data: {"type":"text","del',
          'ta":"Split frame."}\n\n'
        )
      )
    );
    await ask();
    await waitFor(() => expect(screen.getByText("Split frame.")).toBeInTheDocument());
  });

  it("ignores event types it does not know", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        streamResponse(
          "text/event-stream; charset=utf-8",
          'data: {"type":"something_new","payload":1}\n\ndata: {"type":"text","delta":"Still fine."}\n\n'
        )
      )
    );
    await ask();
    await waitFor(() => expect(screen.getByText("Still fine.")).toBeInTheDocument());
  });
});
