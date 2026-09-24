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
        # See tern-llm/src/tern_llm/mcp_client.py's comment: raising inside
        # the async-with blocks below would have anyio's TaskGroup wrap it
        # in a BaseExceptionGroup on the way out, so collect the outcome,
        # let the context managers exit cleanly, then raise/return.
        async with streamable_http_client(self.url) as (read, write):
            async with ClientSession(read, write) as session:
                await session.initialize()
                result = await session.call_tool(name, arguments)
                is_error = result.is_error
                structured = result.structured_content
                text = result.content[0].text if result.content else ""

        if is_error:
            raise RuntimeError(text or f"tool {name} failed")

        # A tool returning list[...] gets ONE TextContent block PER LIST
        # ITEM, not one JSON array -- confirmed empirically, not assumed.
        # content[0].text on a list-returning tool silently returns only
        # the first item (and raises on an empty list). structured_content
        # reliably holds the full value, wrapped as {"result": <value>},
        # for every list size (0/1/many) -- prefer it whenever present.
        if isinstance(structured, dict) and set(structured.keys()) == {"result"}:
            return structured["result"]
        if text:
            return json.loads(text)
        return None
