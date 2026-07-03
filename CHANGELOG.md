# Changelog

## [0.2.0](https://github.com/Joe-Heffer/Peak-District-Downhill/compare/peak-district-downhill-v0.1.0...peak-district-downhill-v0.2.0) (2026-07-03)


### Features

* add a night sky preset with moon, stars, and a bike headlight ([#82](https://github.com/Joe-Heffer/Peak-District-Downhill/issues/82)) ([f385eeb](https://github.com/Joe-Heffer/Peak-District-Downhill/commit/f385eeb5b4475f155c3f9d1233c0ea11e95fa763))
* add dev-tools panel (debug info, log console, admin commands, crash reporting) ([#87](https://github.com/Joe-Heffer/Peak-District-Downhill/issues/87)) ([cb79c43](https://github.com/Joe-Heffer/Peak-District-Downhill/commit/cb79c4303ce5047003e9dc4a288b19b234b525de))
* add forward pedal input with a stamina mechanic ([#83](https://github.com/Joe-Heffer/Peak-District-Downhill/issues/83)) ([436d34f](https://github.com/Joe-Heffer/Peak-District-Downhill/commit/436d34fe1f6c4b8517fbddf3adbe638406d82747))
* add image-based lighting via PMREMGenerator ([#92](https://github.com/Joe-Heffer/Peak-District-Downhill/issues/92)) ([564495c](https://github.com/Joe-Heffer/Peak-District-Downhill/commit/564495c8b83660946b694ba48b75c985b9f82f42)), closes [#69](https://github.com/Joe-Heffer/Peak-District-Downhill/issues/69)
* add landcover-driven terrain styling (woods, rock, track, heather) ([#46](https://github.com/Joe-Heffer/Peak-District-Downhill/issues/46)) ([2a703da](https://github.com/Joe-Heffer/Peak-District-Downhill/commit/2a703da5a1e23a6a56f68063acc54ca98e8ef503)), closes [#21](https://github.com/Joe-Heffer/Peak-District-Downhill/issues/21)
* add minimap and OS grid reference/area name HUD ([#78](https://github.com/Joe-Heffer/Peak-District-Downhill/issues/78)) ([abe9bbc](https://github.com/Joe-Heffer/Peak-District-Downhill/commit/abe9bbced74ceeb447349ab0b61bd0ca1538a2cb))
* calibrate bike speed to real-world gravity, mass, and drag ([#77](https://github.com/Joe-Heffer/Peak-District-Downhill/issues/77)) ([64345c9](https://github.com/Joe-Heffer/Peak-District-Downhill/commit/64345c94635e04bcd872b18081a62ceacf0d4812))
* scatter trailside trees and rocks via THREE.InstancedMesh ([#80](https://github.com/Joe-Heffer/Peak-District-Downhill/issues/80)) ([52389a1](https://github.com/Joe-Heffer/Peak-District-Downhill/commit/52389a1e885589133ac409f7ba49dd5a6b29f72b)), closes [#70](https://github.com/Joe-Heffer/Peak-District-Downhill/issues/70)


### Bug Fixes

* apply max anisotropic filtering to ground texture ([#71](https://github.com/Joe-Heffer/Peak-District-Downhill/issues/71)) ([#91](https://github.com/Joe-Heffer/Peak-District-Downhill/issues/91)) ([736e9ec](https://github.com/Joe-Heffer/Peak-District-Downhill/commit/736e9ecd73dbed99fe5b94efe578907db5e13ae5))
* brighten bike headlight so it reads as visible at night ([#79](https://github.com/Joe-Heffer/Peak-District-Downhill/issues/79)) ([#88](https://github.com/Joe-Heffer/Peak-District-Downhill/issues/88)) ([25e71bc](https://github.com/Joe-Heffer/Peak-District-Downhill/commit/25e71bcd042d96f0fdf10f378fd46a4c7f456171))
* deduplicate changelog entries from merge-commit history ([#42](https://github.com/Joe-Heffer/Peak-District-Downhill/issues/42)) ([5d80c68](https://github.com/Joe-Heffer/Peak-District-Downhill/commit/5d80c680dbd78fd8fabe37201658faa20c968aa9))
* give ground/bike contact real friction and near-zero restitution ([#58](https://github.com/Joe-Heffer/Peak-District-Downhill/issues/58)) ([eec3f6d](https://github.com/Joe-Heffer/Peak-District-Downhill/commit/eec3f6dd736e89429dfbcaa695b963121f339e39))
* prevent bike physics body from falling asleep and ignoring input ([#86](https://github.com/Joe-Heffer/Peak-District-Downhill/issues/86)) ([d02cf4b](https://github.com/Joe-Heffer/Peak-District-Downhill/commit/d02cf4bd4978076ab1bd6da4fccb72246b86e6db))
* stop ground contact from spinning the bike off its steering heading ([#48](https://github.com/Joe-Heffer/Peak-District-Downhill/issues/48)) ([f8758ae](https://github.com/Joe-Heffer/Peak-District-Downhill/commit/f8758ae48736ccb2c9a9184858e9ac735ee7d7f8)), closes [#20](https://github.com/Joe-Heffer/Peak-District-Downhill/issues/20)

## [0.1.0](https://github.com/Joe-Heffer/Peak-District-Downhill/compare/peak-district-downhill-v0.0.1...peak-district-downhill-v0.1.0) (2026-07-02)


### Features

* add dynamic sky dome with time-of-day presets ([612f2f5](https://github.com/Joe-Heffer/Peak-District-Downhill/commit/612f2f555ac2a613be7fa9cc823b675d4c438985))
* add music mute button ([b9a7b16](https://github.com/Joe-Heffer/Peak-District-Downhill/commit/b9a7b162a0f5777848155d4a72fc0408bd43cd31))
* add procedural bike model, terrain texture and audio placeholders ([aef21bb](https://github.com/Joe-Heffer/Peak-District-Downhill/commit/aef21bbda92b9be05a48fca99a59ae71ad04ce85))
* add procedural sky, dynamic lighting and atmosphere ([774aca4](https://github.com/Joe-Heffer/Peak-District-Downhill/commit/774aca4e82487311e84b0eec9b9245d57ef37aaa))
* add real ground texture and audio assets ([#32](https://github.com/Joe-Heffer/Peak-District-Downhill/issues/32)) ([b030577](https://github.com/Joe-Heffer/Peak-District-Downhill/commit/b030577e3b33f3046ae867384896e0766f43d455))
* model terrain and route on the real Cut Gate descent ([f684d94](https://github.com/Joe-Heffer/Peak-District-Downhill/commit/f684d9453d93c3084cd29927d82beaf5e26a79e0))


### Bug Fixes

* correct Cut Gate LIDAR AOI bounding box and regenerate real data ([37cc088](https://github.com/Joe-Heffer/Peak-District-Downhill/commit/37cc088ba65336896fab298521899ee97f4ed8de))
* correct oversized bike model scale ([ce66925](https://github.com/Joe-Heffer/Peak-District-Downhill/commit/ce66925798e8d795d4beafdda29aeae8f3897f63)), closes [#10](https://github.com/Joe-Heffer/Peak-District-Downhill/issues/10)
