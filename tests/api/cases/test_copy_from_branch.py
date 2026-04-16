"""
test_copy_from_branch — 跨分支复制用例
Test ID: 2.8-API-002
Priority: P0
"""
import pytest

from tests.conftest import create_test_user, make_auth_headers


class TestCopyFromBranch:
    """POST /api/projects/{pid}/branches/{bid}/cases/copy-from"""

    async def _setup_two_branches(self, client, db_session):
        """辅助：创建项目 + 2 个分支，源分支有 2 条用例"""
        admin = await create_test_user(db_session, username="copy_admin", role="admin")
        headers, _ = make_auth_headers(admin)
        r = await client.post("/api/projects", headers=headers, json={
            "name": "copy-proj", "gitUrl": "git@x.com:r.git", "scriptBasePath": "/cp",
        })
        pid = r.json()["data"]["id"]

        # 默认分支（源）
        br = await client.get(f"/api/projects/{pid}/branches", headers=headers)
        source_bid = br.json()["data"][0]["id"]

        # 创建目标分支
        r2 = await client.post(f"/api/projects/{pid}/branches", headers=headers, json={
            "name": "target-branch", "branch": "develop",
        })
        target_bid = r2.json()["data"]["id"]

        # 在源分支创建用例
        case_ids = []
        for i in range(2):
            cr = await client.post(f"/api/projects/{pid}/branches/{source_bid}/cases", headers=headers, json={
                "title": f"源用例{i+1}", "type": "api", "module": "auth",
                "submodule": "login", "priority": "P0", "steps": [{"action": f"step{i+1}"}],
            })
            case_ids.append(cr.json()["data"]["id"])

        return headers, pid, source_bid, target_bid, case_ids

    @pytest.mark.asyncio
    async def test_copy_success(self, client, db_session):
        headers, pid, source_bid, target_bid, case_ids = await self._setup_two_branches(client, db_session)

        # When: 复制到目标分支
        response = await client.post(f"/api/projects/{pid}/branches/{target_bid}/cases/copy-from", headers=headers, json={
            "sourceBranchId": source_bid,
            "caseIds": case_ids,
        })

        # Then: 成功复制 2 条
        assert response.status_code == 200
        assert response.json()["data"]["copied"] == 2

        # Then: 目标分支有 2 条新用例（新 ID，新 case_code）
        list_r = await client.get(f"/api/projects/{pid}/branches/{target_bid}/cases", headers=headers)
        target_cases = list_r.json()["data"]
        assert len(target_cases) == 2

        # 新 ID 与源不同
        target_ids = {c["id"] for c in target_cases}
        assert target_ids.isdisjoint(set(case_ids))

        # 标题一致（深拷贝）
        titles = {c["title"] for c in target_cases}
        assert "源用例1" in titles
        assert "源用例2" in titles

    @pytest.mark.asyncio
    async def test_copy_creates_folders_in_target(self, client, db_session):
        headers, pid, source_bid, target_bid, case_ids = await self._setup_two_branches(client, db_session)

        # 目标分支初始无目录
        tree_before = (await client.get(f"/api/projects/{pid}/branches/{target_bid}/folders", headers=headers)).json()["data"]
        assert len(tree_before) == 0

        # When: 复制
        await client.post(f"/api/projects/{pid}/branches/{target_bid}/cases/copy-from", headers=headers, json={
            "sourceBranchId": source_bid,
            "caseIds": case_ids,
        })

        # Then: 目标分支自动创建了 AUTH/LOGIN 目录
        tree_after = (await client.get(f"/api/projects/{pid}/branches/{target_bid}/folders", headers=headers)).json()["data"]
        assert len(tree_after) >= 1
        auth = next(n for n in tree_after if n["name"] == "AUTH")
        assert any(c["name"] == "LOGIN" for c in auth["children"])
