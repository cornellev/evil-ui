"""MCP client for calling EVIL's browsing tools (list_runs/list_turns/
list_laps/list_straights). This is intentionally its own copy of
tern-llm/src/tern_llm/mcp_client.py's shape, not a shared package -- same
"the protocol is the contract, not shared code" reasoning already applied
between evil and tern-llm. evil-ui only ever calls plain list/detail tools
here, no tool-calling loop, so this is deliberately simpler than tern-llm's
version (no .schemas() needed, just .invoke()).
"""

from __future__ import annotations

import asyncio
import json
from typing import Any

from mcp import ClientSession
from mcp.client.streamable_http import streamable_http_client


class MCPToolClient:
    def __init__(self, url: str):
        self.url = url

    def invoke(self, name: str, arguments: dict[str, Any]) -> Any:
        return asyncio.run(self._invoke_async(name, arguments))

    async def _invoke_async(self, name: str, arguments: dict[str, Any]) -> Any:
        """Raising inside the async-with blocks below would have anyio's
        TaskGroup wrap it in a BaseExceptionGroup on the way out, so this
        collects the outcome, lets the context managers exit cleanly, then
        raises/returns after (same reasoning as tern-llm's copy).

        A tool returning list[...] gets ONE TextContent block PER LIST ITEM,
        not one JSON array -- confirmed empirically, not assumed. structured_content
        reliably holds the full value, wrapped as {"result": <value>}, for
        every list size (0/1/many), so it's preferred whenever present. When
        it's unavailable and there's more than one content block, that's
        only possible for a list-returning tool, so the list is reconstructed
        from every block instead of returning just the first (a real gap the
        structured_content preference alone didn't close)."""
        async with streamable_http_client(self.url) as (read, write):
            async with ClientSession(read, write) as session:
                await session.initialize()
                result = await session.call_tool(name, arguments)
                is_error = result.is_error
                structured = result.structured_content
                content_texts = [block.text for block in result.content] if result.content else []

        if is_error:
            raise RuntimeError((content_texts[0] if content_texts else "") or f"tool {name} failed")

        if isinstance(structured, dict) and set(structured.keys()) == {"result"}:
            return structured["result"]
        if len(content_texts) > 1:
            return [json.loads(t) for t in content_texts]
        if content_texts:
            return json.loads(content_texts[0])
        return None
