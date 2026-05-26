character's height bounces up and down as they move. I can find this height (y) using a sine wave based on time (t)and the frequency of steps (f).
Walking: y(t) = y(base) + A(walk) _ abs(sin(pi _ f(walk) _t))
Running: y(t) = y(base) + A(run) _ sin(2(pi)_f(run) _ t)
where
y(base) = starting height
A = bounce size (amplitude) A(run) much higher than A(walk)
f = frequency (how fast she steps)
When a character walks, their upper body stays mostly straight. When they run, they must lean forward from the ankles to show speed and momentum.
theta = theta(base) + (v / v(max)) _ theta(lean)
where
theta(base) = normal upright (~0 deg)
v = speed
v(max) = top running speed
theta(lean) = max lean angle (5-10 deg)
To stop the feet from sliding on the ground, the foot movement speed must match the character's forward speed.
stance phase formula
x(foot)(t) = v _ t - Stride Length _ cos(2(pi) _ f _ t)
The shoulder rotates forward and backward. find the swing angle theta(sholder) using a sine wave.
theta(sholder)(t) = A(shoulder) _ sin(2(pi) _ f _ t + phi)
where
A(shoulder) = swing size (15 to 20 deg walking, 30 to 45 deg for running)
f = step frequency, match to leg step speed
phi = phase shift pi(180 deg) and arms swing in reverse
In a walk, elbows stay mostly loose. In a run, elbows lock at a sharp angle and bend even more as they pump forward.
theta(elbow)(t) = theta(base) - A(elbow) _ sin(2(pi) _ f _ t + phi)
walking: theta(base) 20 deg, A(elbow) 10 deg
running: theta(base) 90 deg, A(elbow) 30 deg
When running fast, the hands twist slightly inward toward the chest at the peak of the forward swing.
theta(inward)(t) = A(inward) _ max(0, sin(2(pi) _ f _ t + phi))
A(inward) = 5 to 10 deg
In a walk, at least one foot always touches the ground. In a run, the character launches into the air.
Left Flight Window: phi between 0.35 and 0.5
Right Flight Window: phi between 0.85 and 1.0
y(flight = y(base) + v(up) _ t(flight) - 0.5 _ g _ t(squared)(flight))
where
v(up) = upward push velocity from foot takeoff
t(flight) = time since flight phase started
g = gravity consstant
To keep balance, the hips and shoulders twist in opposite directions. When the left hip rotates forward, the left shoulder rotates backward.
yaw angle:
theta(hip)(t) = A(hip) _ sin(2(pi) * f *t)
walking: A(hip) is 4 to 6 deg
running A(hip) is 8 to 12 deg
shoulder twist yaw angle
theta(shoulder)(t) = -A(shoulder) _ sin(2(pi) _ f 8 t)
where
Walking: A(shoulder) is ~ 5 deg
Running: A(shoulder) increases to 10 to 15 deg
negative sign: This forces the shoulders to twist opposite to the hips.
