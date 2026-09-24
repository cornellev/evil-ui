"""Regression tests for the list[...]-return bug found via evil-ui's own
stricter tests: a tool returning a list gets one TextContent block PER
LIST ITEM, not one JSON array, so content[0].text alone silently drops all
but the first item and crashes on an empty list. structured_content is the
fix -- these tests pin that behavior for 0/1/many items so it can't regress.
"""

import socket
import threading
import time

import pytest
from mcp.server.mcpserver import MCPServer

from evil_ui_backend.mcp_client import MCPToolClient


def _free_port() -> int:
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    port = s.getsockname()[1]
    s.close()
    return port


@pytest.fixture
def list_tools_mcp_url():
    port = _free_port()
    server = MCPServer("list-test")

    @server.tool()
    async def empty_list() -> list[dict]:
        return []

    @server.tool()
    async def one_item() -> list[dict]:
        return [{"a": 1}]

    @server.tool()
    async def many_items() -> list[dict]:
        return [{"a": 1}, {"a": 2}, {"a": 3}]

    thread = threading.Thread(
        target=lambda: server.run(transport="streamable-http", host="127.0.0.1", port=port),
        daemon=True,
    )
    thread.start()
    for _ in range(50):
        try:
            with socket.create_connection(("127.0.0.1", port), timeout=0.2):
                break
        except OSError:
            time.sleep(0.1)

    yield f"http://127.0.0.1:{port}/mcp"


def test_empty_list_does_not_crash_and_returns_empty_list(list_tools_mcp_url):
    client = MCPToolClient(list_tools_mcp_url)
    assert client.invoke("empty_list", {}) == []


def test_single_item_list_stays_a_list_not_a_bare_dict(list_tools_mcp_url):
    client = MCPToolClient(list_tools_mcp_url)
    assert client.invoke("one_item", {}) == [{"a": 1}]


def test_multi_item_list_does_not_drop_items(list_tools_mcp_url):
    client = MCPToolClient(list_tools_mcp_url)
    assert client.invoke("many_items", {}) == [{"a": 1}, {"a": 2}, {"a": 3}]
