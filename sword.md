Currently, all code related to the sword is in `main.js`
there are 409 instances of the word "sword" in `main.js`
There is a "Sword Offsets" menu in the dev menus
current settings:
length/scale: 1.02
grip point: 0.14
pos X: 0.025
pos Y: -0.015
pos Z: 0.025
pitch X: -1.57079
yaw Y: 0
roll Z: 0.125663
In `main.js` I made changes to lines `206` `223` `224` `225`
length/scale: 2.13
grip point: 1.0
pos X: -0.91
pos Y: 0.8
pos Z: 0.635
pitch X: 1.2
yaw Y: -3.14159
roll Z: 0.325
I made these changes to get the sword closer to where I needed it so I may begin fine tuning it's position. Unfortunately, the changes did not occur, there must be code redundancy.
I believe our goal should be:
1: to eliminate any redundancy.
2: make the changes in `main.js` to reflect the position I need to begin accurate positioning.
3: explore possibilities of moving the sword to a separate `sword.js`. This may not be possible due to the sword's position being relative to the player's position.
Best current offsets:
length/scale: 2.13
grip point: 1.0
pos X: -0.605
pos Y: 0.08
pos Z: 0.605
pitch X: 1.2
yaw Y: -3.82
roll Z: 0.49
