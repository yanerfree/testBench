"""Integration 测试 — services/branch_service.py（需要 DB）"""
import pytest

from app.core.exceptions import ConflictError, ValidationError
from app.schemas.branch import CreateBranchRequest
from app.schemas.project import CreateProjectRequest
from app.services import branch_service, project_service
from tests.conftest import create_test_user


class TestBranchServiceCRUD:

    async def _setup(self, db_session):
        admin = await create_test_user(db_session, username="br_svc_admin", role="admin")
        req = CreateProjectRequest(name="br-proj", git_url="git@x.com:b/r.git", script_base_path="/tmp/b")
        project = await project_service.create_project(db_session, req, admin)
        return project

    @pytest.mark.integration
    @pytest.mark.asyncio
    async def test_list_includes_default(self, db_session):
        project = await self._setup(db_session)
        branches = await branch_service.list_branches(db_session, project.id)
        assert len(branches) == 1
        assert branches[0].name == "default"

    @pytest.mark.integration
    @pytest.mark.asyncio
    async def test_create_branch(self, db_session):
        project = await self._setup(db_session)
        req = CreateBranchRequest(name="develop", branch="develop")
        branch = await branch_service.create_branch(db_session, project.id, req)
        assert branch.name == "develop"
        assert branch.branch == "develop"

    @pytest.mark.integration
    @pytest.mark.asyncio
    async def test_duplicate_name_raises_conflict(self, db_session):
        project = await self._setup(db_session)
        req = CreateBranchRequest(name="default", branch="main")
        with pytest.raises(ConflictError):
            await branch_service.create_branch(db_session, project.id, req)


class TestBranchServiceArchive:

    @pytest.mark.integration
    @pytest.mark.asyncio
    async def test_archive_and_activate(self, db_session):
        admin = await create_test_user(db_session, username="br_svc_arc", role="admin")
        req = CreateProjectRequest(name="arc-proj", git_url="git@x.com:a/r.git", script_base_path="/tmp/a")
        project = await project_service.create_project(db_session, req, admin)

        # 创建第二个分支
        await branch_service.create_branch(db_session, project.id, CreateBranchRequest(name="extra"))

        branches = await branch_service.list_branches(db_session, project.id)
        default = [b for b in branches if b.name == "default"][0]

        archived = await branch_service.archive_branch(db_session, default.id)
        assert archived.status == "archived"

        activated = await branch_service.activate_branch(db_session, default.id)
        assert activated.status == "active"

    @pytest.mark.integration
    @pytest.mark.asyncio
    async def test_cannot_archive_last_active(self, db_session):
        admin = await create_test_user(db_session, username="br_svc_last", role="admin")
        req = CreateProjectRequest(name="last-proj", git_url="git@x.com:l/r.git", script_base_path="/tmp/l2")
        project = await project_service.create_project(db_session, req, admin)

        branches = await branch_service.list_branches(db_session, project.id)
        with pytest.raises(ValidationError):
            await branch_service.archive_branch(db_session, branches[0].id)
