export type CameraViewMode = 'director' | 'camera' | 'top'
export type CameraMovementType =
  | 'static'
  | 'pan'
  | 'tilt'
  | 'zoom'
  | 'dolly'
  | 'track'
  | 'handheld'
export type CameraMovementDirection =
  | 'none'
  | 'left'
  | 'right'
  | 'up'
  | 'down'
  | 'in'
  | 'out'

export type Vec3 = {
  x: number
  y: number
  z: number
}

export type Point2 = {
  x: number
  y: number
  depth: number
  visible: boolean
}

export type CameraSceneInput = {
  camera_height?: unknown
  camera_distance?: unknown
  camera_yaw?: unknown
  camera_pitch?: unknown
  lens_mm?: unknown
  subject_position?: unknown
  camera_movement?: unknown
  camera_movement_type?: unknown
  camera_movement_direction?: unknown
  lighting?: unknown
  camera_pan_offset?: unknown
  camera_tilt_offset?: unknown
  lens_scale?: unknown
}

export type NormalizedCameraScene = {
  cameraHeight: number
  cameraDistance: number
  cameraYaw: number
  cameraPitch: number
  lensMm: number
  subjectPosition: Vec3
  cameraMovement: string
  cameraMovementType: CameraMovementType
  cameraMovementDirection: CameraMovementDirection
  lighting: string
  cameraPanOffset: number
  cameraTiltOffset: number
  lensScale: number
}

export type CameraPose = {
  position: Vec3
  forward: Vec3
  right: Vec3
  up: Vec3
  aimPoint: Vec3
}

export type ProjectedSegment = {
  from: Point2
  to: Point2
}

export type ProjectedPolygon = {
  points: Point2[]
}

export type CameraVisualization = {
  width: number
  height: number
  view: CameraViewMode
  scene: NormalizedCameraScene
  camera: CameraPose
  effectiveLensMm: number
  horizontalFov: number
  verticalFov: number
  floorLines: ProjectedSegment[]
  studioLines: ProjectedSegment[]
  stageLines: ProjectedSegment[]
  frustumLines: ProjectedSegment[]
  focusLine: ProjectedSegment | null
  subject: {
    head: Point2
    headRadius: number
    body: ProjectedPolygon | null
    limbs: ProjectedSegment[]
    ground: Point2
    groundRadius: number
  }
  cameraRig: {
    body: ProjectedPolygon | null
    lens: Point2
    tripod: ProjectedSegment[]
  }
  light: {
    position: Point2
    beam: ProjectedSegment | null
  }
}

export const CAMERA_LIMITS = {
  height: { min: 0.4, max: 2.6, fallback: 1.55 },
  distance: { min: 0.5, max: 6, fallback: 1.8 },
  yaw: { min: -45, max: 45, fallback: 0 },
  pitch: { min: -25, max: 25, fallback: 0 },
  subjectX: { min: -3, max: 3, fallback: 0 },
  subjectY: { min: 0, max: 2.5, fallback: 0 },
  subjectZ: { min: -3, max: 5, fallback: 0 }
} as const

export const CAMERA_LENSES = [24, 35, 50, 70] as const
export const CAMERA_MOVEMENT_TYPES = [
  'static',
  'pan',
  'tilt',
  'zoom',
  'dolly',
  'track',
  'handheld'
] as const satisfies readonly CameraMovementType[]
export const CAMERA_MOVEMENT_DIRECTIONS = [
  'none',
  'left',
  'right',
  'up',
  'down',
  'in',
  'out'
] as const satisfies readonly CameraMovementDirection[]

const ALLOWED_MOVEMENT_DIRECTIONS: Record<
  CameraMovementType,
  readonly CameraMovementDirection[]
> = {
  static: ['none'],
  pan: ['left', 'right'],
  tilt: ['up', 'down'],
  zoom: ['in', 'out'],
  dolly: ['in', 'out'],
  track: ['left', 'right'],
  handheld: ['none']
}

const WORLD_UP: Vec3 = { x: 0, y: 1, z: 0 }
const DEFAULT_VIEWPORT = { width: 720, height: 420 }
const NEAR_PLANE = 0.05
const PAN_LIMITS = { min: -20, max: 20, fallback: 0 }
const TILT_LIMITS = { min: -12, max: 12, fallback: 0 }
const LENS_SCALE_LIMITS = { min: 0.75, max: 1.35, fallback: 1 }

type PerspectiveProjector = {
  kind: 'perspective'
  pose: CameraPose
  width: number
  height: number
  horizontalFov: number
}

type TopProjector = {
  kind: 'top'
  width: number
  height: number
  centerX: number
  centerZ: number
  scale: number
}

type Projector = PerspectiveProjector | TopProjector

function finiteNumber(value: unknown, fallback: number) {
  if (typeof value === 'boolean' || value === null || value === '') {
    return fallback
  }
  try {
    const parsed = typeof value === 'number' ? value : Number(value)
    return Number.isFinite(parsed) ? parsed : fallback
  } catch {
    return fallback
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function clampInput(
  value: unknown,
  limits: { min: number; max: number; fallback: number }
) {
  return clamp(finiteNumber(value, limits.fallback), limits.min, limits.max)
}

function nearestLens(value: unknown) {
  const parsed = finiteNumber(value, 35)
  return CAMERA_LENSES.reduce((nearest, candidate) => {
    const candidateDistance = Math.abs(candidate - parsed)
    const nearestDistance = Math.abs(nearest - parsed)
    return candidateDistance < nearestDistance ? candidate : nearest
  }, CAMERA_LENSES[0])
}

function normalizeMovementType(value: unknown): CameraMovementType {
  const candidate = typeof value === 'string' ? value.trim().toLowerCase() : ''
  return (
    CAMERA_MOVEMENT_TYPES.find((movementType) => movementType === candidate) ??
    'static'
  )
}

function normalizeMovementDirection(
  value: unknown,
  movementType: CameraMovementType
): CameraMovementDirection {
  const candidate = typeof value === 'string' ? value.trim().toLowerCase() : ''
  const direction =
    CAMERA_MOVEMENT_DIRECTIONS.find((item) => item === candidate) ?? 'none'
  return ALLOWED_MOVEMENT_DIRECTIONS[movementType].includes(direction)
    ? direction
    : 'none'
}

export function normalizeCameraScene(
  scene: CameraSceneInput
): NormalizedCameraScene {
  const sourcePosition = Array.isArray(scene.subject_position)
    ? scene.subject_position
    : []
  const movementType = normalizeMovementType(scene.camera_movement_type)

  return {
    cameraHeight: clampInput(scene.camera_height, CAMERA_LIMITS.height),
    cameraDistance: clampInput(scene.camera_distance, CAMERA_LIMITS.distance),
    cameraYaw: clampInput(scene.camera_yaw, CAMERA_LIMITS.yaw),
    cameraPitch: clampInput(scene.camera_pitch, CAMERA_LIMITS.pitch),
    lensMm: nearestLens(scene.lens_mm),
    subjectPosition: {
      x: clampInput(sourcePosition[0], CAMERA_LIMITS.subjectX),
      y: clampInput(sourcePosition[1], CAMERA_LIMITS.subjectY),
      z: clampInput(sourcePosition[2], CAMERA_LIMITS.subjectZ)
    },
    cameraMovement:
      (typeof scene.camera_movement === 'string'
        ? scene.camera_movement.trim()
        : '') || 'Static',
    cameraMovementType: movementType,
    cameraMovementDirection: normalizeMovementDirection(
      scene.camera_movement_direction,
      movementType
    ),
    lighting:
      (typeof scene.lighting === 'string'
        ? scene.lighting.trim().toLowerCase()
        : '') || 'soft_key_left',
    cameraPanOffset: clampInput(scene.camera_pan_offset, PAN_LIMITS),
    cameraTiltOffset: clampInput(scene.camera_tilt_offset, TILT_LIMITS),
    lensScale: clampInput(scene.lens_scale, LENS_SCALE_LIMITS)
  }
}

export function lensToHorizontalFov(lensMm: number) {
  const normalizedLens = Math.max(1, finiteNumber(lensMm, 35))
  return radiansToDegrees(2 * Math.atan(36 / (2 * normalizedLens)))
}

export function verticalFovForAspect(
  horizontalFov: number,
  aspectRatio: number
) {
  const safeAspect = Math.max(0.1, finiteNumber(aspectRatio, 16 / 9))
  const horizontalRadians = degreesToRadians(horizontalFov)
  return radiansToDegrees(
    2 * Math.atan(Math.tan(horizontalRadians / 2) / safeAspect)
  )
}

export function createCameraPose(
  input: CameraSceneInput | NormalizedCameraScene
): CameraPose {
  const scene = 'cameraHeight' in input ? input : normalizeCameraScene(input)
  const yaw = degreesToRadians(scene.cameraYaw)
  const pitch = degreesToRadians(scene.cameraPitch + scene.cameraTiltOffset)
  const subject = scene.subjectPosition
  const position = {
    x: subject.x + Math.sin(yaw) * scene.cameraDistance,
    y: scene.cameraHeight,
    z: subject.z - Math.cos(yaw) * scene.cameraDistance
  }
  const aimPoint = {
    x: subject.x,
    y: subject.y + 1.38,
    z: subject.z
  }
  const base = lookAtPose(position, aimPoint)
  const horizontalForward = normalize(
    rotateAroundAxis(
      base.forward,
      WORLD_UP,
      degreesToRadians(scene.cameraPanOffset)
    ),
    base.forward
  )
  const right = normalize(cross(WORLD_UP, horizontalForward), base.right)
  const horizontalUp = normalize(cross(horizontalForward, right), base.up)
  const forward = normalize(
    add(
      scale(horizontalForward, Math.cos(pitch)),
      scale(horizontalUp, Math.sin(pitch))
    ),
    horizontalForward
  )
  const up = normalize(cross(forward, right), horizontalUp)

  return {
    position,
    forward,
    right,
    up,
    aimPoint
  }
}

export function applyCameraMovement(
  input: CameraSceneInput,
  progress: number
): CameraSceneInput {
  const scene = normalizeCameraScene(input)
  // Directed moves advance from their starting pose to their ending pose.
  // Only handheld shake oscillates; a pan/dolly/tilt must not reverse halfway.
  const normalizedProgress = clamp(finiteNumber(progress, 0), 0, 1)
  const directedProgress = normalizedProgress
  const detailWave = Math.sin(normalizedProgress * Math.PI * 6)
  let distance = scene.cameraDistance
  let panOffset = 0
  let tiltOffset = 0
  let lensScale = 1
  const subject = { ...scene.subjectPosition }
  const direction = scene.cameraMovementDirection

  switch (scene.cameraMovementType) {
    case 'pan':
      if (direction === 'left' || direction === 'right') {
        panOffset += directedProgress * 8 * (direction === 'left' ? -1 : 1)
      }
      break
    case 'tilt':
      if (direction === 'up' || direction === 'down') {
        tiltOffset += directedProgress * 5 * (direction === 'down' ? -1 : 1)
      }
      break
    case 'dolly':
      if (direction === 'in' || direction === 'out') {
        distance *= 1 - directedProgress * 0.12 * (direction === 'out' ? -1 : 1)
      }
      break
    case 'zoom':
      if (direction === 'in' || direction === 'out') {
        lensScale *=
          1 + directedProgress * 0.12 * (direction === 'out' ? -1 : 1)
      }
      break
    case 'track':
      if (direction === 'left' || direction === 'right') {
        subject.x += directedProgress * 0.28 * (direction === 'left' ? -1 : 1)
      }
      break
    case 'handheld':
      panOffset += detailWave * 1.3
      tiltOffset += Math.sin(normalizedProgress * Math.PI * 10) * 0.8
      break
    case 'static':
      break
  }

  return {
    ...input,
    camera_height: scene.cameraHeight,
    camera_distance: distance,
    camera_yaw: scene.cameraYaw,
    camera_pitch: scene.cameraPitch,
    lens_mm: scene.lensMm,
    subject_position: [subject.x, subject.y, subject.z],
    camera_movement: scene.cameraMovement,
    camera_movement_type: scene.cameraMovementType,
    camera_movement_direction: scene.cameraMovementDirection,
    lighting: scene.lighting,
    camera_pan_offset: panOffset,
    camera_tilt_offset: tiltOffset,
    lens_scale: lensScale
  }
}

export function projectCameraSceneAtElapsed(
  input: CameraSceneInput,
  elapsedSeconds: number,
  sceneStartSeconds: number,
  durationSeconds: number
): CameraSceneInput {
  const duration = Math.max(0.001, finiteNumber(durationSeconds, 1))
  const progress = clamp(
    (finiteNumber(elapsedSeconds, 0) - finiteNumber(sceneStartSeconds, 0)) /
      duration,
    0,
    1
  )
  return applyCameraMovement(input, progress)
}

export function projectPoint(
  point: Vec3,
  camera: CameraPose,
  viewport = DEFAULT_VIEWPORT,
  horizontalFov = 54
): Point2 {
  const projector: PerspectiveProjector = {
    kind: 'perspective',
    pose: camera,
    width: viewport.width,
    height: viewport.height,
    horizontalFov
  }
  return projectPerspectivePoint(toCameraSpace(point, camera), projector)
}

export function buildCameraVisualization(
  input: CameraSceneInput,
  view: CameraViewMode,
  viewport = DEFAULT_VIEWPORT
): CameraVisualization {
  const width = Math.max(
    240,
    finiteNumber(viewport.width, DEFAULT_VIEWPORT.width)
  )
  const height = Math.max(
    180,
    finiteNumber(viewport.height, DEFAULT_VIEWPORT.height)
  )
  const scene = normalizeCameraScene(input)
  const camera = createCameraPose(scene)
  const effectiveLensMm = clamp(
    scene.lensMm * scene.lensScale,
    CAMERA_LENSES[0],
    CAMERA_LENSES[3]
  )
  const horizontalFov = lensToHorizontalFov(effectiveLensMm)
  const verticalFov = verticalFovForAspect(horizontalFov, width / height)
  const projector = createProjector(view, camera, scene, width, height)
  const subject = scene.subjectPosition
  const floorSegments: [Vec3, Vec3][] = []
  for (let x = -4; x <= 4; x += 1) {
    floorSegments.push([
      { x, y: 0, z: -3 },
      { x, y: 0, z: 6 }
    ])
  }
  for (let z = -3; z <= 6; z += 1) {
    floorSegments.push([
      { x: -4, y: 0, z },
      { x: 4, y: 0, z }
    ])
  }

  const studioSegments: [Vec3, Vec3][] = [
    [
      { x: -3.5, y: 0, z: 4.5 },
      { x: 3.5, y: 0, z: 4.5 }
    ],
    [
      { x: -3.5, y: 0, z: 4.5 },
      { x: -3.5, y: 3.2, z: 4.5 }
    ],
    [
      { x: 3.5, y: 0, z: 4.5 },
      { x: 3.5, y: 3.2, z: 4.5 }
    ],
    [
      { x: -3.5, y: 3.2, z: 4.5 },
      { x: 3.5, y: 3.2, z: 4.5 }
    ],
    [
      { x: 0, y: 0, z: 4.5 },
      { x: 0, y: 3.2, z: 4.5 }
    ],
    [
      { x: -3.5, y: 1.6, z: 4.5 },
      { x: 3.5, y: 1.6, z: 4.5 }
    ]
  ]

  const stageSegments: [Vec3, Vec3][] = []
  const stageRadius = 1.05
  for (let index = 0; index < 32; index += 1) {
    const start = (index / 32) * Math.PI * 2
    const end = ((index + 1) / 32) * Math.PI * 2
    stageSegments.push([
      {
        x: subject.x + Math.cos(start) * stageRadius,
        y: 0.012,
        z: subject.z + Math.sin(start) * stageRadius
      },
      {
        x: subject.x + Math.cos(end) * stageRadius,
        y: 0.012,
        z: subject.z + Math.sin(end) * stageRadius
      }
    ])
  }

  const subjectRight = camera.right
  const subjectPoint = (horizontal: number, vertical: number) =>
    add(
      { x: subject.x, y: subject.y + vertical, z: subject.z },
      scale(subjectRight, horizontal)
    )
  const headCenter = subjectPoint(0, 1.65)
  const shoulderLeft = subjectPoint(-0.27, 1.35)
  const shoulderRight = subjectPoint(0.27, 1.35)
  const hipLeft = subjectPoint(-0.18, 0.76)
  const hipRight = subjectPoint(0.18, 0.76)
  const subjectBody = projectPolygon(
    [shoulderLeft, shoulderRight, hipRight, hipLeft],
    projector
  )
  const subjectLimbSegments: [Vec3, Vec3][] = [
    [shoulderLeft, subjectPoint(-0.38, 0.88)],
    [shoulderRight, subjectPoint(0.38, 0.88)],
    [hipLeft, subjectPoint(-0.19, 0.04)],
    [hipRight, subjectPoint(0.19, 0.04)]
  ]
  const subjectLimbs = subjectLimbSegments.map(([from, to]) =>
    projectSegment(from, to, projector)
  )

  const rigCenter = add(camera.position, scale(camera.forward, -0.06))
  const rigCorner = (right: number, up: number) =>
    add(add(rigCenter, scale(camera.right, right)), scale(camera.up, up))
  const rigBody = projectPolygon(
    [
      rigCorner(-0.19, -0.11),
      rigCorner(0.19, -0.11),
      rigCorner(0.19, 0.11),
      rigCorner(-0.19, 0.11)
    ],
    projector
  )
  const lensWorld = add(camera.position, scale(camera.forward, 0.13))
  const tripodBase = {
    x: camera.position.x,
    y: 0.04,
    z: camera.position.z
  }
  const tripodHub = {
    x: camera.position.x,
    y: Math.max(0.24, camera.position.y - 0.22),
    z: camera.position.z
  }
  const tripodFeet = [
    add(tripodBase, scale(camera.right, -0.32)),
    add(tripodBase, scale(camera.right, 0.32)),
    add(tripodBase, scale(camera.forward, -0.26))
  ]
  const tripodSegments = [
    projectSegment(camera.position, tripodHub, projector),
    ...tripodFeet.map((foot) => projectSegment(tripodHub, foot, projector))
  ]

  const farDistance = clamp(scene.cameraDistance * 1.35, 2.3, 5.8)
  const farCenter = add(camera.position, scale(camera.forward, farDistance))
  const farHalfWidth =
    Math.tan(degreesToRadians(horizontalFov) / 2) * farDistance
  const farHalfHeight =
    Math.tan(degreesToRadians(verticalFov) / 2) * farDistance
  const frustumCorners = [
    add(
      add(farCenter, scale(camera.right, -farHalfWidth)),
      scale(camera.up, -farHalfHeight)
    ),
    add(
      add(farCenter, scale(camera.right, farHalfWidth)),
      scale(camera.up, -farHalfHeight)
    ),
    add(
      add(farCenter, scale(camera.right, farHalfWidth)),
      scale(camera.up, farHalfHeight)
    ),
    add(
      add(farCenter, scale(camera.right, -farHalfWidth)),
      scale(camera.up, farHalfHeight)
    )
  ]
  const frustumSegments: [Vec3, Vec3][] = []
  for (let index = 0; index < frustumCorners.length; index += 1) {
    frustumSegments.push([lensWorld, frustumCorners[index] as Vec3])
    frustumSegments.push([
      frustumCorners[index] as Vec3,
      frustumCorners[(index + 1) % frustumCorners.length] as Vec3
    ])
  }

  const lightWorld = getLightPosition(scene.lighting, subject)
  const showEquipment = view !== 'camera'

  return {
    width,
    height,
    view,
    scene,
    camera,
    effectiveLensMm,
    horizontalFov,
    verticalFov,
    floorLines: floorSegments
      .map(([from, to]) => projectSegment(from, to, projector))
      .filter(isPresent),
    studioLines: studioSegments
      .map(([from, to]) => projectSegment(from, to, projector))
      .filter(isPresent),
    stageLines: stageSegments
      .map(([from, to]) => projectSegment(from, to, projector))
      .filter(isPresent),
    frustumLines: showEquipment
      ? frustumSegments
          .map(([from, to]) => projectSegment(from, to, projector))
          .filter(isPresent)
      : [],
    focusLine: showEquipment
      ? projectSegment(lensWorld, camera.aimPoint, projector)
      : null,
    subject: {
      head: projectWithProjector(headCenter, projector),
      headRadius: projectedRadius(headCenter, 0.15, projector),
      body: subjectBody,
      limbs: subjectLimbs.filter(isPresent),
      ground: projectWithProjector(subject, projector),
      groundRadius: projectedRadius(subject, 0.32, projector)
    },
    cameraRig: {
      body: showEquipment ? rigBody : null,
      lens: projectWithProjector(lensWorld, projector),
      tripod: showEquipment ? tripodSegments.filter(isPresent) : []
    },
    light: {
      position: projectWithProjector(lightWorld, projector),
      beam: projectSegment(lightWorld, camera.aimPoint, projector)
    }
  }
}

function createProjector(
  view: CameraViewMode,
  camera: CameraPose,
  scene: NormalizedCameraScene,
  width: number,
  height: number
): Projector {
  if (view === 'camera') {
    return {
      kind: 'perspective',
      pose: camera,
      width,
      height,
      horizontalFov: lensToHorizontalFov(
        clamp(
          scene.lensMm * scene.lensScale,
          CAMERA_LENSES[0],
          CAMERA_LENSES[3]
        )
      )
    }
  }

  if (view === 'top') {
    const centerX = (camera.position.x + scene.subjectPosition.x) / 2
    const centerZ = (camera.position.z + scene.subjectPosition.z) / 2
    const spanX = Math.max(
      8,
      Math.abs(camera.position.x - scene.subjectPosition.x) + 3.2
    )
    const spanZ = Math.max(
      8,
      Math.abs(camera.position.z - scene.subjectPosition.z) + 3.2
    )
    return {
      kind: 'top',
      width,
      height,
      centerX,
      centerZ,
      scale: Math.min(width / spanX, height / spanZ) * 0.78
    }
  }

  const midpoint = scale(add(camera.position, scene.subjectPosition), 0.5)
  const observerPosition = add(midpoint, { x: 5.8, y: 4.1, z: -7.7 })
  const observerTarget = add(midpoint, { x: 0, y: 0.82, z: 0.7 })
  return {
    kind: 'perspective',
    pose: lookAtPose(observerPosition, observerTarget),
    width,
    height,
    horizontalFov: 55
  }
}

function getLightPosition(lighting: string, subject: Vec3): Vec3 {
  if (lighting.includes('back')) {
    return add(subject, { x: 0.4, y: 2.65, z: 2.3 })
  }
  if (lighting.includes('right')) {
    return add(subject, { x: 2.35, y: 2.45, z: -0.55 })
  }
  if (lighting.includes('flat')) {
    return add(subject, { x: 0, y: 2.75, z: -1.5 })
  }
  return add(subject, { x: -2.35, y: 2.45, z: -0.55 })
}

function lookAtPose(position: Vec3, aimPoint: Vec3): CameraPose {
  const forward = normalize(subtract(aimPoint, position), { x: 0, y: 0, z: 1 })
  const right = normalize(cross(WORLD_UP, forward), { x: 1, y: 0, z: 0 })
  const up = normalize(cross(forward, right), WORLD_UP)
  return { position, forward, right, up, aimPoint }
}

function projectWithProjector(point: Vec3, projector: Projector): Point2 {
  if (projector.kind === 'top') {
    return {
      x: projector.width / 2 + (point.x - projector.centerX) * projector.scale,
      y: projector.height / 2 + (point.z - projector.centerZ) * projector.scale,
      depth: -point.y,
      visible: true
    }
  }
  return projectPerspectivePoint(
    toCameraSpace(point, projector.pose),
    projector
  )
}

function projectPerspectivePoint(
  point: Vec3,
  projector: PerspectiveProjector
): Point2 {
  const tangent = Math.tan(degreesToRadians(projector.horizontalFov) / 2)
  const focalScale = projector.width / (2 * tangent)
  const depth = point.z
  if (depth < NEAR_PLANE || !Number.isFinite(depth)) {
    return {
      x: projector.width / 2,
      y: projector.height / 2,
      depth,
      visible: false
    }
  }
  const x = projector.width / 2 + (point.x / depth) * focalScale
  const y = projector.height / 2 - (point.y / depth) * focalScale
  return {
    x,
    y,
    depth,
    visible: Number.isFinite(x) && Number.isFinite(y)
  }
}

function projectSegment(
  from: Vec3,
  to: Vec3,
  projector: Projector
): ProjectedSegment | null {
  if (projector.kind === 'top') {
    return {
      from: projectWithProjector(from, projector),
      to: projectWithProjector(to, projector)
    }
  }

  let cameraFrom = toCameraSpace(from, projector.pose)
  let cameraTo = toCameraSpace(to, projector.pose)
  if (cameraFrom.z <= NEAR_PLANE && cameraTo.z <= NEAR_PLANE) return null
  if (cameraFrom.z <= NEAR_PLANE) {
    cameraFrom = clipToNearPlane(cameraFrom, cameraTo)
  } else if (cameraTo.z <= NEAR_PLANE) {
    cameraTo = clipToNearPlane(cameraTo, cameraFrom)
  }
  return {
    from: projectPerspectivePoint(cameraFrom, projector),
    to: projectPerspectivePoint(cameraTo, projector)
  }
}

function projectPolygon(
  points: Vec3[],
  projector: Projector
): ProjectedPolygon | null {
  const projected = points.map((point) =>
    projectWithProjector(point, projector)
  )
  return projected.every((point) => point.visible)
    ? { points: projected }
    : null
}

function projectedRadius(center: Vec3, radius: number, projector: Projector) {
  if (projector.kind === 'top') return radius * projector.scale
  const centerPoint = projectWithProjector(center, projector)
  const edgePoint = projectWithProjector(
    add(center, scale(projector.pose.right, radius)),
    projector
  )
  if (!centerPoint.visible || !edgePoint.visible) return 0
  return Math.max(
    1,
    Math.hypot(edgePoint.x - centerPoint.x, edgePoint.y - centerPoint.y)
  )
}

function clipToNearPlane(behind: Vec3, ahead: Vec3) {
  const denominator = ahead.z - behind.z
  if (Math.abs(denominator) < 1e-9) {
    return { ...behind, z: NEAR_PLANE }
  }
  const amount = (NEAR_PLANE - behind.z) / denominator
  return {
    x: behind.x + (ahead.x - behind.x) * amount,
    y: behind.y + (ahead.y - behind.y) * amount,
    z: NEAR_PLANE
  }
}

function toCameraSpace(point: Vec3, camera: CameraPose): Vec3 {
  const relative = subtract(point, camera.position)
  return {
    x: dot(relative, camera.right),
    y: dot(relative, camera.up),
    z: dot(relative, camera.forward)
  }
}

function add(left: Vec3, right: Vec3): Vec3 {
  return {
    x: left.x + right.x,
    y: left.y + right.y,
    z: left.z + right.z
  }
}

function subtract(left: Vec3, right: Vec3): Vec3 {
  return {
    x: left.x - right.x,
    y: left.y - right.y,
    z: left.z - right.z
  }
}

function scale(vector: Vec3, amount: number): Vec3 {
  return {
    x: vector.x * amount,
    y: vector.y * amount,
    z: vector.z * amount
  }
}

function dot(left: Vec3, right: Vec3) {
  return left.x * right.x + left.y * right.y + left.z * right.z
}

function cross(left: Vec3, right: Vec3): Vec3 {
  return {
    x: left.y * right.z - left.z * right.y,
    y: left.z * right.x - left.x * right.z,
    z: left.x * right.y - left.y * right.x
  }
}

function rotateAroundAxis(vector: Vec3, axis: Vec3, angle: number): Vec3 {
  const normalizedAxis = normalize(axis, WORLD_UP)
  const cosine = Math.cos(angle)
  const sine = Math.sin(angle)
  return add(
    add(scale(vector, cosine), scale(cross(normalizedAxis, vector), sine)),
    scale(normalizedAxis, dot(normalizedAxis, vector) * (1 - cosine))
  )
}

function normalize(vector: Vec3, fallback: Vec3): Vec3 {
  const length = Math.hypot(vector.x, vector.y, vector.z)
  return length > 1e-9 ? scale(vector, 1 / length) : fallback
}

function degreesToRadians(degrees: number) {
  return (degrees * Math.PI) / 180
}

function radiansToDegrees(radians: number) {
  return (radians * 180) / Math.PI
}

function isPresent<T>(value: T | null): value is T {
  return value !== null
}
