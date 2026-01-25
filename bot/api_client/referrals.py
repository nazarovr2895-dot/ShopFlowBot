from bot.api_client.base import make_request

async def api_register_ref_link(new_user_id: int, referrer_id: int):
    await make_request("POST", "/agents/bind", data={"user_id": new_user_id, "agent_id": referrer_id})
    return True