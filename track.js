import * as THREE from 'three';
import { isPointOnOBB } from './utils.js';

export class TrackManager {
    constructor(scene) {
        this.scene = scene;
        this.segments = [];
        this.posts = [];
        this.width = 12; 

        // Texture Loading
        const loader = new THREE.TextureLoader();
        this.roadTexture = loader.load('./asphalt_tile.png');
        this.roadTexture.wrapS = THREE.RepeatWrapping;
        this.roadTexture.wrapT = THREE.RepeatWrapping;
        this.roadTexture.repeat.set(1, 4);
        
        // Texture Filtering for smoother look
        this.roadTexture.minFilter = THREE.LinearMipmapLinearFilter;
        this.roadTexture.magFilter = THREE.LinearFilter;
        this.roadTexture.anisotropy = 16; 

        this.roadMat = new THREE.MeshStandardMaterial({ 
            map: this.roadTexture,
            roughness: 0.4, 
            metalness: 0.1, 
            color: 0x666666
        });

        const postTexture = loader.load('./post_texture.png');
        this.postGeo = new THREE.CylinderGeometry(0.8, 0.8, 6, 16);
        this.postMat = new THREE.MeshStandardMaterial({ 
            map: postTexture,
            color: 0xffffff, 
            emissive: 0xff4400,
            emissiveIntensity: 1.5,
            metalness: 0.8,
            roughness: 0.2
        });

        // Initial generation state
        this.currentPos = new THREE.Vector3(0, 0, 0);
        this.currentDir = new THREE.Vector3(0, 0, 1); // Moving +Z (Horizontal heading)
        this.segmentLength = 50;

        // Build initial straight
        this.addSegment({ type: 'straight', length: 80, slope: 0 });
        this.generateNextSegment();
        this.generateNextSegment();
        this.generateNextSegment();
        this.generateNextSegment(); // Add a few more for buffer
    }

    addSegment(params) {
        const { type, length = 50, turnDir = 1, angle = Math.PI / 2, slope = 0 } = params;

        // Calculate dimensions based on slope
        // length is the surface length.
        const horizLength = length * Math.cos(slope);
        const vertHeight = length * Math.sin(slope);

        const seg = {
            type: type,
            start: this.currentPos.clone(),
            dir: this.currentDir.clone(), // This is the horizontal heading
            length: length,
            horizLength: horizLength,
            width: this.width,
            mesh: null,
            angle: 0, // Yaw
            slope: slope // Pitch
        };

        // Visuals
        const geo = new THREE.PlaneGeometry(this.width, length);
        const mesh = new THREE.Mesh(geo, this.roadMat);
        
        // Orient the mesh
        // 1. Position at midpoint
        const halfHoriz = this.currentDir.clone().multiplyScalar(horizLength / 2);
        const midpoint = this.currentPos.clone().add(halfHoriz);
        midpoint.y += vertHeight / 2;
        
        mesh.position.copy(midpoint);

        // 2. Rotate
        // Use YXZ order to prevent gimbal lock issues and ensure correct orientation
        // Yaw (Y) first to face direction, then Pitch (X) for slope
        mesh.rotation.order = 'YXZ';
        mesh.rotation.y = Math.atan2(this.currentDir.x, this.currentDir.z) + Math.PI;
        mesh.rotation.x = -Math.PI / 2 + slope;

        seg.angle = mesh.rotation.y; // Yaw

        this.scene.add(mesh);
        seg.mesh = mesh;
        this.segments.push(seg);

        // Update Head
        this.currentPos.add(this.currentDir.clone().multiplyScalar(horizLength));
        this.currentPos.y += vertHeight;

        // Turns and Corners
        if (type === 'turn') {
            // Corner is flat for simplicity? Or sloped?
            // Sloped corners are complex to mesh join. 
            // Strategy: Force corners to be FLAT or continue previous slope?
            // Let's make corners flatten out to avoid "twisting" geometry issues for now,
            // OR continue the slope. Continuing slope on a turn creates a spiral.
            // Let's try to keep corners relatively flat (slope 0) to separate hill segments from turn segments.
            // This simplifies the math significantly.
            // But if we want overpasses, we might need to turn while climbing.
            // Let's allow slope on turns.
            
            // Corner Patch
            // To make a seamless corner with slope, we treat it as a pie slice or just a small square.
            // A square corner with slope is tricky because the outer edge travels further than inner.
            // For now, let's treat the 'corner' connector as a flat landing if possible, or same slope.
            // Current code adds a square "corner" mesh.
            
            // If we have slope, the corner mesh needs to tilt. 
            // But the next segment will rotate 90 degrees.
            // If we tilt the corner, the "side" becomes the "start" of the next road.
            // If we pitch up into a turn, the cross-slope of the next road is weird.
            // SIMPLIFICATION: We only slope on STRAIGHTS. Turns are flat.
            // This means we might need a small transition or just snap.
            // Actually, let's just use the `slope` param. If we passed slope=0 for turns, fine.
            // But we need to handle the vertical gap if the previous straight was sloped?
            // No, `currentPos` tracks the end of the previous segment.
            
            // Corner implementation:
            const cornerGeo = new THREE.PlaneGeometry(this.width, this.width);
            const cornerMesh = new THREE.Mesh(cornerGeo, this.roadMat);
            
            // Position: CurrentPos is at the end of the straight.
            // The straight ended. We are at the start of the turn.
            // The "corner" fills the intersection.
            // Center of corner square:
            const cornerCenterOffset = this.currentDir.clone().multiplyScalar(this.width / 2);
            // Move vertically based on slope?
            // If the turn is flat, the corner is flat.
            // We should align the corner with the *end* of the incoming road.
            // So pitch it to match incoming slope?
            // If we do that, and the outgoing road is flat, we have a kink.
            // Let's just make the corner mesh match the incoming slope (Pitch) 
            // and the outgoing road start from the corner's end.
            
            const cornerCenter = this.currentPos.clone().add(cornerCenterOffset);
            // Height adjustment for slope across the corner width?
            // If slope is 0 (flat turn), easy.
            // If slope != 0, we calculate rise over the half-width?
            // Let's effectively pause slope during the corner block to keep it sane.
            // So Corner is FLAT (Slope 0).
            
            cornerMesh.rotation.order = 'YXZ';
            cornerMesh.rotation.y = Math.atan2(this.currentDir.x, this.currentDir.z) + Math.PI;
            cornerMesh.rotation.x = -Math.PI / 2; // Flat

            cornerMesh.position.copy(cornerCenter);
            cornerMesh.position.y = this.currentPos.y; // Flatten out at the joint
            
            this.scene.add(cornerMesh);

            this.segments.push({
                type: 'corner',
                mesh: cornerMesh,
                start: this.currentPos.clone(),
                dir: this.currentDir.clone(),
                length: this.width,
                width: this.width,
                angle: seg.angle,
                slope: 0
            });

            // Add Post
            this.addPost(cornerCenter, turnDir);

            // Update state for next segment
            this.currentPos.add(cornerCenterOffset); // Move to center of corner
            
            // Rotate direction
            const rotationAxis = new THREE.Vector3(0, 1, 0);
            this.currentDir.applyAxisAngle(rotationAxis, turnDir * angle); 
            
            // Move to edge of corner in new direction
            this.currentPos.add(this.currentDir.clone().multiplyScalar(this.width / 2));
        }
    }

    addPost(centerPos, turnDir) {
        // Perpendicular vector
        const perp = new THREE.Vector3(-this.currentDir.z, 0, this.currentDir.x);
        // Vector to inner corner
        const cornerVector = perp.clone().multiplyScalar(-turnDir).sub(this.currentDir).normalize();
        
        const postPos = centerPos.clone();
        postPos.add(cornerVector.multiplyScalar(12));
        
        // Adjust post height to match road
        // The post is 6 units tall (centered). 
        // We want the top to be reachable.
        // If road is at Y=100, post should be at Y=100 + offset.
        // Mesh Y is center.
        postPos.y += 2; 

        const post = new THREE.Mesh(this.postGeo, this.postMat);
        post.position.copy(postPos);
        this.scene.add(post);

        this.posts.push({
            mesh: post,
            position: postPos,
            active: true
        });
    }

    checkCollision(box, height) {
        // Simple collision check against existing segments
        // box: { center, width, length, angle } (XZ)
        // height: y level
        // We only care if we are overlapping in XZ AND close in Y.
        
        // Optimisation: only check last 50 segments
        const checkCount = Math.min(this.segments.length, 50);
        const start = Math.max(0, this.segments.length - checkCount);
        
        for (let i = start; i < this.segments.length - 2; i++) { // Don't check immediate neighbors
            const seg = this.segments[i];
            
            // Check Y distance
            const yDist = Math.abs(seg.start.y - height);
            if (yDist > 15) continue; // Clear vertical separation

            // Check XZ overlap
            // Using simple distance check as heuristic before expensive OBB
            const dist = new THREE.Vector2(box.center.x, box.center.z).distanceTo(new THREE.Vector2(seg.mesh.position.x, seg.mesh.position.z));
            const maxRadius = Math.max(box.length, seg.length) / 2 + Math.max(box.width, seg.width) / 2;
            
            if (dist < maxRadius) {
                // Potential overlap, assume collision for safety to force overpass
                return true;
            }
        }
        return false;
    }

    generateNextSegment() {
        const rand = Math.random();
        
        // Decide segment parameters
        let type = 'straight';
        let length = 80 + Math.random() * 60;
        let turnDir = 0;
        let slope = 0;

        // Turn Logic
        if (rand > 0.6) { // 40% chance of turn
            type = 'turn';
            turnDir = Math.random() > 0.5 ? 1 : -1;
            length = 50 + Math.random() * 30; // Straights leading to turns are shorter
            // Turns force flat slope in current implementation
            slope = 0;
        } else {
            // Straight Logic - Chance for Slope
            const slopeRand = Math.random();
            if (slopeRand < 0.3) {
                slope = 0.2; // Up ~11 deg
            } else if (slopeRand < 0.6) {
                slope = -0.2; // Down
            } else {
                slope = 0;
            }
        }

        // Lookahead / Collision Avoidance
        // Project where this segment would land
        const tempHorizLen = length * Math.cos(slope);
        const centerOffset = this.currentDir.clone().multiplyScalar(tempHorizLen / 2);
        const projectedCenter = this.currentPos.clone().add(centerOffset);
        
        // If we detect collision, try to force a slope change to clear it
        if (this.checkCollision({
            center: projectedCenter,
            width: this.width,
            length: tempHorizLen,
            angle: 0
        }, this.currentPos.y)) {
            // Collision detected!
            // Change slope to go UP/DOWN aggressively?
            // Or just swap to a slope if we were flat.
            if (slope === 0) {
                slope = 0.35; // Steep climb
            } else {
                slope = -slope; // Invert logic
            }
            
            // If turn, cancel turn and go straight up to clear obstacle
            if (type === 'turn') {
                type = 'straight';
                length = 100; // Long bridge
            }
        }

        this.addSegment({ type, length, turnDir, slope });
    }

    getTrackState(position) {
        // Return { onTrack: bool, height: number, slope: number }
        // Iterate segments to find which one we are on.
        // We might be on multiple in XZ (overpass). Pick the closest Y.
        
        // Only check nearby segments
        const checkCount = Math.min(this.segments.length, 30);
        const startIndex = Math.max(0, this.segments.length - checkCount);

        let bestSeg = null;
        let bestY = -Infinity;
        let minDistY = Infinity;

        for (let i = startIndex; i < this.segments.length; i++) {
            const seg = this.segments[i];
            
            // 1. Broad Phase: Vertical Range
            // A segment spans from start.y to start.y + length*sin(slope)
            const y1 = seg.start.y;
            const y2 = y1 + seg.length * Math.sin(seg.slope);
            const minY = Math.min(y1, y2) - 5;
            const maxY = Math.max(y1, y2) + 5;
            
            if (position.y < minY || position.y > maxY) continue;

            // 2. Narrow Phase: OBB in XZ
            if (isPointOnOBB(position, seg.mesh.position, seg.width + 2, seg.horizLength || seg.length, seg.angle)) {
                
                // 3. Calculate exact height at this XZ
                // Project position onto the segment line/plane
                // Distance from start along dir
                const vecToPos = new THREE.Vector2(position.x - seg.start.x, position.z - seg.start.z);
                const dir2D = new THREE.Vector2(seg.dir.x, seg.dir.z); // Normalized horizontal dir
                const distAlong = vecToPos.dot(dir2D);
                
                // Height = startY + distAlong * tan(slope)
                // Use tan because slope is angle of pitch. 
                // However, we used mesh.rotation.x = slope. 
                // Vertical rise = horizontal_dist * tan(slope).
                const exactY = seg.start.y + distAlong * Math.tan(seg.slope);
                
                const distY = Math.abs(position.y - exactY);
                
                // Pick the segment closest to car vertically
                if (distY < minDistY) {
                    minDistY = distY;
                    bestY = exactY;
                    bestSeg = seg;
                }
            }
        }

        if (bestSeg && minDistY < 8) { // 8 units vertical snap tolerance
            return { 
                onTrack: true, 
                height: bestY, 
                slope: bestSeg.slope, 
                segment: bestSeg 
            };
        }

        // Check Posts (Collision spheres for cornering forgiveness)
        for(let p of this.posts) {
            if (position.distanceTo(p.position) < this.width * 1.5) {
                // If near post, maintain current height? Or post height?
                // Return 'onTrack' but no specific height control (free fly) or keep level
                return { onTrack: true, height: position.y, slope: 0 };
            }
        }

        return { onTrack: false };
    }

    // Deprecated but kept for compatibility if needed, aliased to getTrackState
    isOnTrack(position) {
        return this.getTrackState(position).onTrack;
    }
    
    getNearestPost(position) {
        let nearest = null;
        let minDist = Infinity;
        const checkCount = Math.min(this.posts.length, 20);
        const startIndex = this.posts.length - checkCount;
        for (let i = startIndex; i < this.posts.length; i++) {
            const post = this.posts[i];
            
            // Filter out posts that are on different height levels (overpasses/underpasses)
            if (Math.abs(post.position.y - position.y) > 15) continue;

            const dist = position.distanceTo(post.position);
            if (dist < minDist) {
                minDist = dist;
                nearest = post;
            }
        }
        return { post: nearest, distance: minDist };
    }
}