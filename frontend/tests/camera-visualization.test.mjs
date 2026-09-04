import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import ts from 'typescript'

async function loadTypeScriptModule(relativePath) {
  const source = readFileSync(new URL(relativePath, import.meta.url), 'utf8')
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022
    },
    fileName: relativePath,
    reportDiagnostics: true
  })
  const errors = (transpiled.diagnostics ?? []).filter(
    (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error
  )
  assert.deepEqual(errors, [], relativePath + ' should transpile cleanly')
  return import(
    'data:text/javascript;base64,' +
      Buffer.from(transpiled.outputText).toString('base64')
  )
}

const {
  applyCameraMovement,
  buildCameraVisualization,
  createCameraPose,
  lensToHorizontalFov,
  normalizeCameraScene,
  projectCameraSceneAtElapsed,
  projectPoint,
  verticalFovForAspect
} = await loadTypeScriptModule('../src/lib/camera-visualization.ts')

test('normalizes malformed values into the supported camera envelope', () => {
  assert.deepEqual(
    normalizeCameraScene({
      camera_height: Number.POSITIVE_INFINITY,
      camera_distance: -12,
      camera_yaw: 200,
      camera_pitch: -90,
      lens_mm: 57,
      subject_position: [20, -4, 'not-a-number'],
      camera_movement: 42
    }),
    {
      cameraHeight: 1.55,
      cameraDistance: 0.5,
      cameraYaw: 45,
      cameraPitch: -25,
      lensMm: 50,
      subjectPosition: { x: 3, y: 0, z: 0 },
      cameraMovement: 'Static',
      cameraMovementType: 'static',
      cameraMovementDirection: 'none',
      lighting: 'soft_key_left',
      cameraPanOffset: 0,
      cameraTiltOffset: 0,
      lensScale: 1
    }
  )
  assert.equal(
    normalizeCameraScene({ camera_height: Symbol('invalid') }).cameraHeight,
    1.55
  )
})

test('derives physically consistent fields of view from equivalent focal length', () => {
  const wide = lensToHorizontalFov(24)
  const normal = lensToHorizontalFov(35)
  const telephoto = lensToHorizontalFov(70)

  assert.ok(wide > normal)
  assert.ok(normal > telephoto)
  assert.ok(Math.abs(wide - 73.74) < 0.1)
  assert.ok(Math.abs(telephoto - 28.84) < 0.1)
  assert.ok(verticalFovForAspect(normal, 16 / 9) < normal)
})

test('places the camera deterministically around the supplied subject', () => {
  const pose = createCameraPose({
    camera_height: 1.7,
    camera_distance: 2,
    camera_yaw: 30,
    camera_pitch: 0,
    subject_position: [1, 0, 2]
  })

  assert.ok(Math.abs(pose.position.x - 2) < 1e-9)
  assert.ok(Math.abs(pose.position.y - 1.7) < 1e-9)
  assert.ok(Math.abs(pose.position.z - (2 - Math.sqrt(3))) < 1e-9)
  assert.deepEqual(pose.aimPoint, { x: 1, y: 1.38, z: 2 })
})

test('projects the aim point to frame centre and makes pitch observable', () => {
  const viewport = { width: 720, height: 420 }
  const level = createCameraPose({
    camera_pitch: 0,
    subject_position: [0.4, 0, 0.7]
  })
  const centred = projectPoint(level.aimPoint, level, viewport, 54)

  assert.ok(Math.abs(centred.x - viewport.width / 2) < 1e-8)
  assert.ok(Math.abs(centred.y - viewport.height / 2) < 1e-8)

  const pitched = createCameraPose({
    camera_pitch: 12,
    subject_position: [0.4, 0, 0.7]
  })
  const shifted = projectPoint(pitched.aimPoint, pitched, viewport, 54)
  assert.ok(Math.abs(shifted.y - viewport.height / 2) > 20)
})

test('lens choice changes camera POV framing and frustum geometry', () => {
  const wide = buildCameraVisualization({ lens_mm: 24 }, 'camera')
  const telephoto = buildCameraVisualization({ lens_mm: 70 }, 'camera')
  assert.ok(telephoto.subject.headRadius > wide.subject.headRadius)

  const widePlan = buildCameraVisualization({ lens_mm: 24 }, 'top')
  const telephotoPlan = buildCameraVisualization({ lens_mm: 70 }, 'top')
  const segmentSpread = (visualization) => {
    const points = visualization.frustumLines.flatMap((line) => [
      line.from.x,
      line.to.x
    ])
    return Math.max(...points) - Math.min(...points)
  }
  assert.ok(segmentSpread(widePlan) > segmentSpread(telephotoPlan))

  const closeRadii = [24, 35, 50, 70].map(
    (lens) =>
      buildCameraVisualization(
        { lens_mm: lens, camera_distance: 0.5 },
        'camera'
      ).subject.headRadius
  )
  assert.ok(
    closeRadii.every(
      (radius, index) => index === 0 || radius > closeRadii[index - 1]
    )
  )
})

test('director, plan and camera projections are finite and distinct', () => {
  const input = {
    camera_height: 1.4,
    camera_distance: 2.4,
    camera_yaw: -28,
    camera_pitch: 8,
    lens_mm: 35,
    subject_position: [0.7, 0, 1.1],
    lighting: 'window_right'
  }
  const director = buildCameraVisualization(input, 'director')
  const camera = buildCameraVisualization(input, 'camera')
  const top = buildCameraVisualization(input, 'top')

  for (const visualization of [director, camera, top]) {
    for (const line of [
      ...visualization.floorLines,
      ...visualization.studioLines,
      ...visualization.stageLines
    ]) {
      assert.ok(Number.isFinite(line.from.x))
      assert.ok(Number.isFinite(line.from.y))
      assert.ok(Number.isFinite(line.to.x))
      assert.ok(Number.isFinite(line.to.y))
      assert.equal(line.from.visible, true)
      assert.equal(line.to.visible, true)
    }
  }

  assert.notDeepEqual(
    [director.subject.ground.x, director.subject.ground.y],
    [top.subject.ground.x, top.subject.ground.y]
  )
  assert.equal(camera.frustumLines.length, 0)
  assert.ok(director.frustumLines.length > 0)
})

test('canonical camera movement uses repeatable geometry without mutating the source', () => {
  const source = {
    camera_yaw: 4,
    camera_pitch: 2,
    camera_distance: 2,
    lens_mm: 35,
    subject_position: [0, 0, 0],
    camera_movement: 'Slow pan left',
    camera_movement_type: 'pan',
    camera_movement_direction: 'left'
  }
  const first = applyCameraMovement(source, 0.25)
  const second = applyCameraMovement(source, 0.25)

  assert.deepEqual(first, second)
  assert.equal(first.camera_yaw, 4)
  assert.equal(first.camera_pan_offset, -2)
  assert.equal(source.camera_yaw, 4)
  assert.deepEqual(source.subject_position, [0, 0, 0])

  const sourcePose = createCameraPose(source)
  const movedPose = createCameraPose(first)
  assert.deepEqual(movedPose.position, sourcePose.position)
  assert.notDeepEqual(movedPose.forward, sourcePose.forward)

  const panRight = applyCameraMovement(
    {
      ...source,
      camera_movement: 'Slow pan right',
      camera_movement_direction: 'right'
    },
    0.25
  )
  assert.equal(panRight.camera_pan_offset, 2)

  const laterPan = applyCameraMovement(source, 0.75)
  assert.ok(laterPan.camera_pan_offset < first.camera_pan_offset)

  const dollyOutEarly = applyCameraMovement(
    {
      ...source,
      camera_movement: 'Depărtare cameră',
      camera_movement_type: 'dolly',
      camera_movement_direction: 'out'
    },
    0.25
  )
  const dollyOutLate = applyCameraMovement(
    {
      ...source,
      camera_movement: 'Depărtare cameră',
      camera_movement_type: 'dolly',
      camera_movement_direction: 'out'
    },
    0.75
  )
  assert.ok(dollyOutEarly.camera_distance > source.camera_distance)
  assert.ok(dollyOutLate.camera_distance > dollyOutEarly.camera_distance)

  const zoomed = applyCameraMovement(
    {
      ...source,
      camera_movement: 'Zoom in',
      camera_movement_type: 'zoom',
      camera_movement_direction: 'in'
    },
    0.25
  )
  assert.equal(zoomed.camera_distance, source.camera_distance)
  assert.ok(
    buildCameraVisualization(zoomed, 'camera').horizontalFov <
      buildCameraVisualization(source, 'camera').horizontalFov
  )
})

test('all canonical directions produce the intended deterministic movement', () => {
  const base = {
    camera_distance: 2,
    lens_mm: 35,
    subject_position: [0, 0, 0],
    camera_movement: 'Localized display label'
  }

  const panLeft = applyCameraMovement(
    {
      ...base,
      camera_movement_type: 'pan',
      camera_movement_direction: 'left'
    },
    0.5
  )
  const panRight = applyCameraMovement(
    {
      ...base,
      camera_movement_type: 'pan',
      camera_movement_direction: 'right'
    },
    0.5
  )
  const tiltUp = applyCameraMovement(
    {
      ...base,
      camera_movement_type: 'tilt',
      camera_movement_direction: 'up'
    },
    0.5
  )
  const tiltDown = applyCameraMovement(
    {
      ...base,
      camera_movement_type: 'tilt',
      camera_movement_direction: 'down'
    },
    0.5
  )
  const zoomIn = applyCameraMovement(
    {
      ...base,
      camera_movement_type: 'zoom',
      camera_movement_direction: 'in'
    },
    0.5
  )
  const zoomOut = applyCameraMovement(
    {
      ...base,
      camera_movement_type: 'zoom',
      camera_movement_direction: 'out'
    },
    0.5
  )
  const dollyIn = applyCameraMovement(
    {
      ...base,
      camera_movement_type: 'dolly',
      camera_movement_direction: 'in'
    },
    0.5
  )
  const dollyOut = applyCameraMovement(
    {
      ...base,
      camera_movement_type: 'dolly',
      camera_movement_direction: 'out'
    },
    0.5
  )
  const trackLeft = applyCameraMovement(
    {
      ...base,
      camera_movement_type: 'track',
      camera_movement_direction: 'left'
    },
    0.5
  )
  const handheld = applyCameraMovement(
    {
      ...base,
      camera_movement_type: 'handheld',
      camera_movement_direction: 'none'
    },
    0.25
  )
  const staticScene = applyCameraMovement(
    {
      ...base,
      camera_movement_type: 'static',
      camera_movement_direction: 'none'
    },
    0.5
  )

  assert.equal(panLeft.camera_pan_offset, -4)
  assert.equal(panRight.camera_pan_offset, 4)
  assert.equal(tiltUp.camera_tilt_offset, 2.5)
  assert.equal(tiltDown.camera_tilt_offset, -2.5)
  assert.equal(zoomIn.lens_scale, 1.06)
  assert.equal(zoomOut.lens_scale, 0.94)
  assert.ok(dollyIn.camera_distance < base.camera_distance)
  assert.ok(dollyOut.camera_distance > base.camera_distance)
  assert.ok(trackLeft.subject_position[0] < 0)
  assert.notEqual(handheld.camera_pan_offset, 0)
  assert.equal(staticScene.camera_pan_offset, 0)
  assert.equal(staticScene.camera_tilt_offset, 0)
  assert.equal(staticScene.camera_movement_direction, 'none')
})

test('localized movement labels in every supported language are presentation-only', () => {
  const localizedScenes = [
    ['en', 'Slow pan left', 'pan', 'left'],
    ['ro', 'Filmare din mână', 'handheld', 'none'],
    ['es', 'Inclinación hacia abajo', 'tilt', 'down'],
    ['fr', 'Zoom avant', 'zoom', 'in'],
    ['de', 'Kamerafahrt zurück', 'dolly', 'out'],
    ['it', 'Panoramica a destra', 'pan', 'right'],
    ['pt', 'Inclinação para cima', 'tilt', 'up']
  ]

  for (const [language, label, movementType, direction] of localizedScenes) {
    const input = {
      camera_distance: 2,
      lens_mm: 35,
      subject_position: [0, 0, 0],
      camera_movement: label,
      camera_movement_type: movementType,
      camera_movement_direction: direction
    }
    const localized = applyCameraMovement(input, 0.4)
    const neutral = applyCameraMovement(
      { ...input, camera_movement: 'Unrelated presentation copy' },
      0.4
    )

    assert.deepEqual(
      {
        distance: localized.camera_distance,
        lensScale: localized.lens_scale,
        pan: localized.camera_pan_offset,
        position: localized.subject_position,
        tilt: localized.camera_tilt_offset
      },
      {
        distance: neutral.camera_distance,
        lensScale: neutral.lens_scale,
        pan: neutral.camera_pan_offset,
        position: neutral.subject_position,
        tilt: neutral.camera_tilt_offset
      },
      `${language} display copy must not drive geometry`
    )
  }

  const misleadingLabel = applyCameraMovement(
    {
      camera_movement: 'Pan right',
      camera_movement_type: 'pan',
      camera_movement_direction: 'left'
    },
    0.5
  )
  assert.equal(misleadingLabel.camera_pan_offset, -4)
})

test('elapsed projection preserves paused progress and the completed end pose', () => {
  const scene = {
    camera_movement: 'Pan right',
    camera_movement_type: 'pan',
    camera_movement_direction: 'right'
  }
  const paused = projectCameraSceneAtElapsed(scene, 12.5, 10, 5)
  const stillPaused = projectCameraSceneAtElapsed(scene, 12.5, 10, 5)
  const ended = projectCameraSceneAtElapsed(scene, 15, 10, 5)
  const afterEnd = projectCameraSceneAtElapsed(scene, 99, 10, 5)

  assert.equal(paused.camera_pan_offset, 4)
  assert.deepEqual(stillPaused, paused)
  assert.equal(ended.camera_pan_offset, 8)
  assert.deepEqual(afterEnd, ended)
})
