.PHONY: test test-cov test-unit test-integration test-api test-e2e

test:
	pytest

test-cov:
	pytest --cov --cov-report=term-missing

test-unit:
	pytest tests/unit/

test-integration:
	pytest tests/integration/

test-api:
	pytest tests/api/

test-e2e:
	pytest tests/e2e/
