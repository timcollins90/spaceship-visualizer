// src/Visualizer.jsx
import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import './App.css';

const Visualizer = () => {
    const mountRef = useRef(null);
    const [started, setStarted] = useState(false);
    
    // Mutable refs to store data without re-renders
    const refs = useRef({
        analyser: null, dataArray: null, scene: null, camera: null, 
        renderer: null, stars: null, asteroids: [], frameId: null
    });

    // 1. Audio Setup
    const getMicStream = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            const src = audioCtx.createMediaStreamSource(stream);
            const analyser = audioCtx.createAnalyser();
            analyser.fftSize = 256;
            src.connect(analyser);
            
            refs.current.analyser = analyser;
            refs.current.dataArray = new Uint8Array(analyser.frequencyBinCount);
            setStarted(true);
        } catch (error) {
            console.error("Mic Error:", error);
            alert("Microphone access denied. Please allow audio permission.");
        }
    };

    const getFreq = () => {
        const { analyser, dataArray } = refs.current;
        if (!analyser) return { bass: 0, mid: 0, treble: 0, total: 0 };
        analyser.getByteFrequencyData(dataArray);
        
        let bass = 0, mid = 0, treble = 0, total = 0;
        for (let i = 0; i < 4; i++) bass += dataArray[i];
        for (let i = 4; i < 16; i++) mid += dataArray[i];
        for (let i = 16; i < 32; i++) treble += dataArray[i];
        for (let i = 0; i < analyser.frequencyBinCount; i++) total += dataArray[i];
        
        return { 
            bass: bass/4/255, mid: mid/12/255, 
            treble: treble/16/255, total: total/analyser.frequencyBinCount/255 
        };
    };

    // 2. Three.js Logic
    useEffect(() => {
        if (!started) return;

        // Scene & Camera
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(75, window.innerWidth/window.innerHeight, 0.1, 1000);
        camera.position.set(0, 0, 10);
        
        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setClearColor(0x000000, 1);
        renderer.setSize(window.innerWidth, window.innerHeight);
        
        if (mountRef.current) {
            mountRef.current.appendChild(renderer.domElement);
        }

        // Stars
        const starGeo = new THREE.BufferGeometry();
        const pos = [];
        for(let i=0; i<10000; i++) pos.push((Math.random()-0.5)*300, (Math.random()-0.5)*300, -Math.random()*400);
        starGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ size: 0.7, color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending }));
        scene.add(stars);

        // Asteroids
        const asteroids = [];
        for(let i=0; i<40; i++) {
            const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(1,0), new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true }));
            mesh.position.set((Math.random()-0.5)*150, (Math.random()-0.5)*150, -100-Math.random()*200);
            mesh.userData = { 
                rot: { x:(Math.random()-0.5)*0.02, y:(Math.random()-0.5)*0.02, z:(Math.random()-0.5)*0.02 }, 
                speed: 0.3+Math.random()*0.5 
            };
            asteroids.push(mesh);
            scene.add(mesh);
        }

        refs.current = { ...refs.current, scene, camera, renderer, stars, asteroids };

        // Animation Loop
        let smoothedStrength = 0;
        let activity = 0.2;

        const animate = () => {
            refs.current.frameId = requestAnimationFrame(animate);
            const audio = getFreq();
            
            // React to audio intensity
            smoothedStrength = smoothedStrength * 0.9 + audio.total * 0.1;
            activity = smoothedStrength > 0.08 ? Math.min(1.0, activity + 0.05) : Math.max(0.2, activity - 0.01);

            // Move Stars
            const starPos = stars.geometry.attributes.position.array;
            for(let i=2; i<starPos.length; i+=3) {
                starPos[i] += (0.05 + audio.mid * 0.8) * activity;
                if(starPos[i] > camera.position.z) starPos[i] = -400;
            }
            stars.geometry.attributes.position.needsUpdate = true;
            stars.material.opacity = 0.4 + audio.treble * 0.6 * activity;

            // Move Asteroids
            asteroids.forEach(a => {
                a.position.z += (a.userData.speed + audio.total * 8) * activity;
                if(a.position.z > camera.position.z) a.position.set((Math.random()-0.5)*150, (Math.random()-0.5)*150, -200-Math.random()*200);
                
                const s = (0.5+Math.random()*0.5)*(1+audio.total*2.0*activity);
                a.scale.setScalar(s);
                a.rotation.x += a.userData.rot.x * (1+audio.mid*2) * activity;
                a.rotation.y += a.userData.rot.y * (1+audio.bass*2) * activity;
                
                const col = 0.4 + audio.total * 1.5 * activity;
                a.material.color.setRGB(col, col, col);
            });

            // Camera Shake
            camera.position.x = (Math.random()-0.5) * audio.bass * 0.5 * activity;
            camera.position.y = (Math.random()-0.5) * audio.bass * 0.5 * activity;
            
            renderer.render(scene, camera);
        };
        
        animate();

        // Cleanup on unmount
        return () => {
            cancelAnimationFrame(refs.current.frameId);
            if(mountRef.current && renderer.domElement) {
                mountRef.current.removeChild(renderer.domElement);
            }
            renderer.dispose();
        };
    }, [started]);

    return (
        <div style={{width:'100%', height:'100%'}}>
            {!started && (
                <button id="startButton" onClick={getMicStream}>Start Visualizer</button>
            )}
            
            {started && <div id="cockpit-overlay"></div>}
            
            <div ref={mountRef} style={{width:'100%', height:'100%'}} />
        </div>
    );
};

export default Visualizer;