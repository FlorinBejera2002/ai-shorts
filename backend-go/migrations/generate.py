import io
from pathlib import Path
from alembic.script import ScriptDirectory
from alembic.migration import MigrationContext
from alembic.operations import Operations

scripts = ScriptDirectory('/source/alembic')
for i, revision in enumerate(reversed(list(scripts.walk_revisions()))):
    output = io.StringIO()
    context = MigrationContext.configure(dialect_name='postgresql', opts={
        'as_sql': True, 'literal_binds': True, 'output_buffer': output,
    })
    with Operations.context(context):
        revision.module.upgrade()
    Path(f'/out/{i+1:03}_{revision.revision}.sql').write_text(
        f'-- revision: {revision.revision}\n-- parent: {revision.down_revision or "base"}\n' + output.getvalue())
