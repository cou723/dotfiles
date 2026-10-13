"""Offline stdio handshake/tool discovery. Never authenticate or call account tools."""
import asyncio
import os
import tempfile
from pathlib import Path

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client


async def main():
    with tempfile.TemporaryDirectory() as home:
        # Do not inherit credentials, service account keys, .env or OAuth modes.
        env = {
            "HOME": home,
            "PATH": os.environ["PATH"],
            "XDG_CONFIG_HOME": str(Path(home) / "config"),
            "XDG_STATE_HOME": str(Path(home) / "state"),
        }
        parameters = StdioServerParameters(command=os.environ["GMAIL_COMMAND"], env=env)
        async with stdio_client(parameters) as (read, write):
            async with ClientSession(read, write) as session:
                await session.initialize()
                tools = (await session.list_tools()).tools
                names = {tool.name for tool in tools}
                required = {
                    "start_google_auth", "search_gmail_messages", "get_gmail_message_content",
                    "get_gmail_thread_content", "get_gmail_attachment_content",
                    "draft_gmail_message", "send_gmail_message",
                }
                assert required <= names, required - names
                assert not {
                    "modify_gmail_message_labels", "batch_modify_gmail_message_labels",
                    "manage_gmail_label", "manage_gmail_filter", "search_drive_files",
                } & names
                print("Workspace MCP stdio handshake and Gmail-only tool discovery: OK (no account/API calls)")


asyncio.run(main())
