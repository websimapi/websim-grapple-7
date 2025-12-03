import * as THREE from 'three';

export class Car {
    constructor(scene) {
        this.scene = scene;
        this.mesh = new THREE.Group();
        
        // Physics state
        this.position = new THREE.Vector3(0, 1, 0);
        this.velocity = new THREE.Vector3(0, 0, 0);
        this.speed = 30; 
        this.direction = new THREE.Vector3(0, 0, 1); 
        this.verticalVelocity = 0; // Added for gravity
        
        // Grapple State
        this.grappleState = 'IDLE'; 
        this.grappleTarget = null;
        this.hookPosition = new THREE.Vector3();
        this.grappleCount = 0;
        
        // Visuals
        this.createDetailedMesh();
        
        // --- GRAPPLE VISUALS ---
        
        // 1. Detailed Hook Mesh
        this.hookMesh = new THREE.Group();
        
        // Shaft
        const shaftGeo = new THREE.CylinderGeometry(0.15, 0.15, 1.0, 8);
        shaftGeo.rotateX(-Math.PI / 2); // Align with Z
        const shaftMat = new THREE.MeshStandardMaterial({ 
            color: 0x222222, 
            metalness: 0.9, 
            roughness: 0.1 
        });
        const shaft = new THREE.Mesh(shaftGeo, shaftMat);
        this.hookMesh.add(shaft);

        // Claws
        const clawMat = new THREE.MeshStandardMaterial({ 
            color: 0x00ffff, 
            emissive: 0x004444,
            metalness: 0.8, 
            roughness: 0.2 
        });
        
        // Create 3 Claws
        for(let i=0; i<3; i++) {
            const pivot = new THREE.Group();
            pivot.rotation.z = (i / 3) * Math.PI * 2;
            
            const clawGeo = new THREE.BoxGeometry(0.12, 0.6, 0.12);
            // Bend/Angle the claw
            clawGeo.translate(0, 0.3, 0); // Pivot at base
            
            const claw = new THREE.Mesh(clawGeo, clawMat);
            claw.rotation.x = Math.PI / 3; // Open angle
            claw.position.z = 0.2; // Offset from shaft center
            
            pivot.add(claw);
            this.hookMesh.add(pivot);
        }
        
        // Glowing Core / Magnet
        const coreGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.3, 16);
        coreGeo.rotateX(-Math.PI / 2);
        const coreMat = new THREE.MeshBasicMaterial({ color: 0x00ffff });
        const core = new THREE.Mesh(coreGeo, coreMat);
        this.hookMesh.add(core);

        this.scene.add(this.hookMesh);
        this.hookMesh.visible = false;

        // 2. Thick Grapple Rope (Tube/Cylinder)
        // Geometry designed to be scaled along Z axis
        const ropeGeo = new THREE.CylinderGeometry(0.06, 0.06, 1, 8);
        ropeGeo.translate(0, 0.5, 0); // Pivot at bottom
        ropeGeo.rotateX(Math.PI / 2); // Align Y to Z
        
        const ropeMat = new THREE.MeshStandardMaterial({ 
            color: 0x00ffff,
            emissive: 0x00aaaa,
            emissiveIntensity: 1.0,
            roughness: 0.4,
            metalness: 0.5
        });

        this.grappleRope = new THREE.Mesh(ropeGeo, ropeMat);
        this.grappleRope.frustumCulled = false; // Important: prevent disappearing when stretching
        this.grappleRope.visible = false;
        this.scene.add(this.grappleRope);

        // Drift particles (Basic)
        this.smokeParticles = [];
    }

    createDetailedMesh() {
        // Car Dimensions
        const width = 1.8;
        const length = 4.2;
        const height = 0.8;

        // Materials
        const bodyMat = new THREE.MeshStandardMaterial({ 
            color: 0x111111, 
            metalness: 0.9, 
            roughness: 0.2,
        });
        
        const cabinMat = new THREE.MeshPhysicalMaterial({ 
            color: 0x000000,
            metalness: 1.0,
            roughness: 0.0,
            transmission: 0.2, // Looks like dark glass
            reflectivity: 1.0
        });

        const neonCyan = new THREE.MeshBasicMaterial({ color: 0x00ffff });
        const neonMagenta = new THREE.MeshBasicMaterial({ color: 0xff00ff });
        const tailLightMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
        const headLightMat = new THREE.MeshBasicMaterial({ color: 0xffffff });

        // 1. Main Chassis
        const chassisGeo = new THREE.BoxGeometry(width, height, length);
        const chassis = new THREE.Mesh(chassisGeo, bodyMat);
        chassis.position.y = height / 2 + 0.3; // Lift off ground
        chassis.castShadow = true;
        this.mesh.add(chassis);

        // 2. Cabin / Cockpit
        const cabinGeo = new THREE.BoxGeometry(width * 0.7, height * 0.6, length * 0.4);
        const cabin = new THREE.Mesh(cabinGeo, cabinMat);
        cabin.position.set(0, height + 0.3 + (height * 0.3), -0.2);
        this.mesh.add(cabin);

        // 3. Side Pontoons / Fenders (Wider lower body)
        const fenderGeo = new THREE.BoxGeometry(width + 0.4, height * 0.6, length);
        const fender = new THREE.Mesh(fenderGeo, bodyMat);
        fender.position.set(0, 0.5, 0);
        this.mesh.add(fender);

        // 4. Wheels
        const wheelGeo = new THREE.CylinderGeometry(0.4, 0.4, 0.4, 16);
        const wheelMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughnes: 0.8 });
        
        const wheelPositions = [
            [-0.9, 0.4, 1.2], // FL
            [0.9, 0.4, 1.2],  // FR
            [-0.9, 0.4, -1.2], // RL
            [0.9, 0.4, -1.2]   // RR
        ];

        wheelPositions.forEach(pos => {
            const wheel = new THREE.Mesh(wheelGeo, wheelMat);
            wheel.rotation.z = Math.PI / 2;
            wheel.position.set(...pos);
            this.mesh.add(wheel);
        });

        // 5. Neon Strips
        const stripGeo = new THREE.BoxGeometry(0.1, 0.1, length * 0.9);
        
        const leftStrip = new THREE.Mesh(stripGeo, neonCyan);
        leftStrip.position.set(-width/2 - 0.2, 0.8, 0);
        this.mesh.add(leftStrip);

        const rightStrip = new THREE.Mesh(stripGeo, neonMagenta);
        rightStrip.position.set(width/2 + 0.2, 0.8, 0);
        this.mesh.add(rightStrip);

        // 6. Lights
        const headLightGeo = new THREE.BoxGeometry(0.4, 0.2, 0.1);
        const hlLeft = new THREE.Mesh(headLightGeo, headLightMat);
        hlLeft.position.set(-0.5, 0.7, length/2);
        this.mesh.add(hlLeft);

        const hlRight = new THREE.Mesh(headLightGeo, headLightMat);
        hlRight.position.set(0.5, 0.7, length/2);
        this.mesh.add(hlRight);

        const tailLightGeo = new THREE.BoxGeometry(0.3, 0.2, 0.1);
        const tlLeft = new THREE.Mesh(tailLightGeo, tailLightMat);
        tlLeft.position.set(-0.6, 0.8, -length/2);
        this.mesh.add(tlLeft);

        const tlRight = new THREE.Mesh(tailLightGeo, tailLightMat);
        tlRight.position.set(0.6, 0.8, -length/2);
        this.mesh.add(tlRight);

        // Spoiler
        const spoilerGeo = new THREE.BoxGeometry(width + 0.4, 0.1, 0.8);
        const spoiler = new THREE.Mesh(spoilerGeo, bodyMat);
        spoiler.position.set(0, 1.2, -length/2 + 0.2);
        this.mesh.add(spoiler);

        const spoilerPostGeo = new THREE.BoxGeometry(0.1, 0.4, 0.4);
        const spLeft = new THREE.Mesh(spoilerPostGeo, bodyMat);
        spLeft.position.set(-0.6, 1.0, -length/2 + 0.4);
        this.mesh.add(spLeft);
        
        const spRight = new THREE.Mesh(spoilerPostGeo, bodyMat);
        spRight.position.set(0.6, 1.0, -length/2 + 0.4);
        this.mesh.add(spRight);


        // Real Lights
        const light = new THREE.SpotLight(0xffffff, 20, 80, 0.6, 0.5, 1);
        light.position.set(0, 2, 0);
        light.target.position.set(0, 0, 15);
        this.mesh.add(light);
        this.mesh.add(light.target);

        // Engine Glow
        const engineLight = new THREE.PointLight(0x00ffff, 2, 5);
        engineLight.position.set(0, 0.5, -1.5);
        this.mesh.add(engineLight);

        this.scene.add(this.mesh);
    }

    createMesh() {
        // Deprecated simple mesh
    }

    hide() {
        this.mesh.visible = false;
        this.hookMesh.visible = false;
        this.grappleRope.visible = false;
    }

    update(dt, input, trackManager) {
        // 1. Input & State Management
        const grappleInfo = trackManager.getNearestPost(this.position);
        
        // Input Handling
        if (input.mouseDown) {
            // Attempt to fire if IDLE and valid target
            if (this.grappleState === 'IDLE' && grappleInfo.post && grappleInfo.distance < 45) { // Increased range slightly
                this.fireGrapple(grappleInfo.post);
            }
        } else {
            // Release if currently engaged
            if (this.grappleState === 'FIRING' || this.grappleState === 'ATTACHED') {
                this.releaseGrapple();
            }
        }

        // State Machine Logic
        this.updateGrapplePhysics(dt);

        // Variables for rotation
        const targetQuat = new THREE.Quaternion();
        
        // 3D Terrain Handling
        const trackState = trackManager.getTrackState(this.position);

        // 2. Car Movement
        if (this.grappleState === 'ATTACHED' && this.grappleTarget) {
            // Circular Motion Logic (Grappling)
            const postPos = this.grappleTarget.position;
            const radiusVector = new THREE.Vector3().subVectors(this.position, postPos);
            
            // Project logic to 2D for steering, but keep Y relative
            const radius2D = new THREE.Vector2(radiusVector.x, radiusVector.z).length();
            
            // Tangent Logic
            let tangent = new THREE.Vector3().crossVectors(radiusVector, new THREE.Vector3(0, 1, 0)).normalize();
            if (tangent.dot(this.direction) < 0) tangent.negate();

            // Move
            const arcLength = this.speed * dt;
            const angleChange = arcLength / radius2D; // Approx
            
            const toPost = new THREE.Vector3().subVectors(postPos, this.position);
            const crossY = new THREE.Vector3().crossVectors(this.direction, toPost).y;
            const rotDir = crossY > 0 ? -1 : 1; 

            // Calculate Roll
            const grappleRoll = rotDir * 0.35;

            const pos2D = new THREE.Vector2(this.position.x - postPos.x, this.position.z - postPos.z);
            pos2D.rotateAround(new THREE.Vector2(0,0), rotDir * angleChange);
            
            this.position.x = postPos.x + pos2D.x;
            this.position.z = postPos.z + pos2D.y;

            this.direction.copy(tangent).normalize();
            
            // While grappling, we might swing vertically? 
            // For now, let's keep gravity active to pull down, but rope holds? 
            // Simplifying: Grappling ignores track slope, maintains height or falls slowly?
            // Let's allow grappling to "swing" (gravity pulls down).
            this.verticalVelocity -= 20 * dt; // Gravity
            this.position.y += this.verticalVelocity * dt;

            // Simple floor check if we swing too low
            if (trackState.onTrack && this.position.y < trackState.height + 1) {
                this.position.y = trackState.height + 1;
                this.verticalVelocity = 0;
            }
            
            this.speed = Math.min(this.speed + 15 * dt, 55);

            // Set Target Rotation (Yaw + Roll)
            const yaw = Math.atan2(this.direction.x, this.direction.z);
            targetQuat.setFromEuler(new THREE.Euler(0, yaw, grappleRoll, 'XYZ'));

        } else {
            // Linear Motion
            this.speed = THREE.MathUtils.lerp(this.speed, 35, dt * 2);
            
            // Calculate horizontal movement
            const moveStep = this.direction.clone().multiplyScalar(this.speed * dt);
            this.position.x += moveStep.x;
            this.position.z += moveStep.z;
            
            // Vertical Physics (Gravity + Road Snap)
            if (trackState.onTrack) {
                // 2-Point Suspension Logic for smooth ramp transitions
                const lookAhead = 1.8;
                const fwd = this.direction.clone().normalize();
                
                // Sample points ahead and behind to look for slope changes
                const pFront = this.position.clone().add(fwd.clone().multiplyScalar(lookAhead));
                const pRear = this.position.clone().add(fwd.clone().multiplyScalar(-lookAhead));
                
                // Get track height at samples
                const sFront = trackManager.getTrackState(pFront);
                const sRear = trackManager.getTrackState(pRear);
                
                let targetY = trackState.height;
                let terrainNormal = new THREE.Vector3(0, 1, 0);
                let terrainForward = fwd;

                // If both samples are on track, calculate exact pitch from geometry
                if (sFront.onTrack && sRear.onTrack) {
                    const hFront = sFront.height;
                    const hRear = sRear.height;
                    targetY = (hFront + hRear) / 2;
                    
                    // Create slope vector
                    const pF = pFront.clone(); pF.y = hFront;
                    const pR = pRear.clone(); pR.y = hRear;
                    terrainForward = new THREE.Vector3().subVectors(pF, pR).normalize();
                    
                    // Derive Normal and Right from Forward + Global Up
                    const globalUp = new THREE.Vector3(0, 1, 0);
                    const tRight = new THREE.Vector3().crossVectors(globalUp, terrainForward).normalize();
                    // Recalculate normal to be orthogonal to new forward
                    terrainNormal = new THREE.Vector3().crossVectors(terrainForward, tRight).normalize();
                } 
                else if (trackState.segment) {
                    // Fallback to single segment orientation
                    const segQuat = new THREE.Quaternion().setFromEuler(trackState.segment.mesh.rotation);
                    terrainNormal = new THREE.Vector3(0, 0, 1).applyQuaternion(segQuat);
                }

                // Snap to road with damping
                const diff = targetY - this.position.y;
                this.position.y += diff * 25 * dt;
                
                // Construct Rotation Basis
                // Right = Cross(Normal, Forward) -> Ensures no roll unless normal dictates it
                // Forward = Cross(Right, Normal) -> Aligns with slope
                const right = new THREE.Vector3().crossVectors(terrainNormal, terrainForward).normalize();
                const realForward = new THREE.Vector3().crossVectors(right, terrainNormal).normalize();
                
                const rotMat = new THREE.Matrix4().makeBasis(right, terrainNormal, realForward);
                targetQuat.setFromRotationMatrix(rotMat);
                
                this.verticalVelocity = 0;
            } else {
                // Falling
                this.verticalVelocity -= 40 * dt; // Gravity
                this.position.y += this.verticalVelocity * dt;
                
                // Nose dive when falling
                const yaw = Math.atan2(this.direction.x, this.direction.z);
                targetQuat.setFromEuler(new THREE.Euler(0.5, yaw, 0, 'XYZ'));
            }
        }

        // Apply Position
        this.mesh.position.copy(this.position);
        
        // Apply Rotation (Smooth Slerp)
        this.mesh.quaternion.slerp(targetQuat, dt * 10);
    }

    fireGrapple(target) {
        this.grappleState = 'FIRING';
        this.grappleTarget = target;
        this.hookPosition.copy(this.position); // Start at car
        this.hookMesh.visible = true;
        this.grappleRope.visible = true;
    }

    releaseGrapple() {
        if (this.grappleState === 'ATTACHED') {
            this.grappleCount++;
            this.autoStraighten();
        }
        this.grappleState = 'RETRACTING';
        // Keep target for retraction origin references if needed, but we use hookPosition
        this.grappleTarget = null;
    }

    updateGrapplePhysics(dt) {
        const hookSpeed = 200; // Speed of hook travel

        if (this.grappleState === 'FIRING') {
            const targetPos = this.grappleTarget.position;
            const dist = this.hookPosition.distanceTo(targetPos);
            const travelDist = hookSpeed * dt;

            if (dist <= travelDist) {
                // Reached target
                this.hookPosition.copy(targetPos);
                this.grappleState = 'ATTACHED';
            } else {
                // Move towards target
                const dir = new THREE.Vector3().subVectors(targetPos, this.hookPosition).normalize();
                this.hookPosition.add(dir.multiplyScalar(travelDist));
            }
        }
        else if (this.grappleState === 'ATTACHED') {
            // Lock hook to post (in case of floating point drift or moving posts)
            if (this.grappleTarget) {
                this.hookPosition.copy(this.grappleTarget.position);
            }
        }
        else if (this.grappleState === 'RETRACTING') {
            const targetPos = this.position; // Retract to car
            const dist = this.hookPosition.distanceTo(targetPos);
            const travelDist = hookSpeed * dt;

            if (dist <= travelDist) {
                // Reached car
                this.grappleState = 'IDLE';
                this.hookMesh.visible = false;
                this.grappleRope.visible = false;
            } else {
                // Move towards car
                const dir = new THREE.Vector3().subVectors(targetPos, this.hookPosition).normalize();
                this.hookPosition.add(dir.multiplyScalar(travelDist));
            }
        }

        // Update Visuals
        if (this.grappleState !== 'IDLE') {
            // Update Rope Transform
            // We want the rope to start at the car's roof/grapple point and end at the hook
            
            const startPos = this.position.clone();
            startPos.y += 0.8; // Car roof height
            
            const endPos = this.hookPosition.clone();
            const dist = startPos.distanceTo(endPos);
            
            // 1. Position at start
            this.grappleRope.position.copy(startPos);
            // 2. Look at end
            this.grappleRope.lookAt(endPos);
            // 3. Scale Z to match distance (since geo is rotated to Z)
            this.grappleRope.scale.set(1, 1, dist);

            // Update Hook Mesh orientation
            this.hookMesh.position.copy(this.hookPosition);
            
            // Orient hook
            if (this.grappleState === 'FIRING') {
                this.hookMesh.lookAt(this.grappleTarget.position);
            } else if (this.grappleState === 'RETRACTING') {
                this.hookMesh.lookAt(this.position);
            } else {
                 // Attached: look at car (tension)
                 this.hookMesh.lookAt(this.position);
            }
        }
    }

    autoStraighten() {
        const cardinals = [
            new THREE.Vector3(0, 0, 1),
            new THREE.Vector3(0, 0, -1),
            new THREE.Vector3(1, 0, 0),
            new THREE.Vector3(-1, 0, 0)
        ];

        let maxDot = -Infinity;
        let bestDir = null;

        for (const dir of cardinals) {
            const dot = this.direction.dot(dir);
            if (dot > maxDot) {
                maxDot = dot;
                bestDir = dir;
            }
        }

        // If reasonably aligned (within ~25 degrees, dot > 0.9), snap to cardinal direction
        if (maxDot > 0.9 && bestDir) {
            this.direction.copy(bestDir);
        }
    }
}