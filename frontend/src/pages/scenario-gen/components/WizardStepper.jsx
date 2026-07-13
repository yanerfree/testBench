import { Steps } from 'antd'

const STAGES = [
  { key: 'input', title: '输入需求' },
  { key: 'requirements', title: '确认需求点' },
  { key: 'model', title: '确认场景模型' },
  { key: 'generate', title: '生成' },
  { key: 'review', title: '评审' },
]

const STAGE_ORDER = { input: 0, requirements: 1, model: 2, generate: 3, review: 4 }

function getReachedIndex(taskStatus, hasModel) {
  const base = {
    extracting: 0,
    confirmed: 2,
    generating: 3,
    completed: 4,
    partial_failed: 3,
    failed: 3,
    aborted: 3,
  }
  if (taskStatus === 'model_ready') {
    return hasModel ? 2 : 1
  }
  return base[taskStatus] ?? 0
}

export default function WizardStepper({ currentStage, onStageClick, taskStatus, hasModel }) {
  const currentIndex = STAGE_ORDER[currentStage] ?? 0
  const reachedIndex = getReachedIndex(taskStatus, hasModel)

  return (
    <Steps
      current={currentIndex}
      size="small"
      style={{ maxWidth: 700, margin: '0 auto' }}
      items={STAGES.map((s, i) => ({
        title: s.title,
        status: i < reachedIndex ? 'finish' : i === currentIndex ? 'process' : 'wait',
        style: { cursor: i <= reachedIndex ? 'pointer' : 'default' },
        onClick: () => {
          if (i <= reachedIndex && onStageClick) {
            onStageClick(s.key)
          }
        },
      }))}
    />
  )
}
