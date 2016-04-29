// <reference path="engine.ts">
// <reference path="stats.d.ts">

let canvas: HTMLCanvasElement,
    meshes: SoftwareEngine.Mesh[],
    camera: SoftwareEngine.Camera,
    device: SoftwareEngine.Device;

let keys = {};  
  
let stats;

function setUpEngine() {
    canvas = <HTMLCanvasElement> document.getElementById("softEngine");
    meshes = new Array();
    
    camera = new SoftwareEngine.Camera();
    camera.Position.z = -5;
    camera.Target = new BABYLON.Vector3(0, 0, 0);
    
    device = new SoftwareEngine.Device(canvas);
    
    device.loadJsonFileAsync("Monkey.babylon", onLoadComplete)
    
    // Statistics panel
    stats = new Stats();
    stats.showPanel(0);
    document.getElementById("fpsOverlay").appendChild(stats.domElement);
}

function onLoadComplete(meshesLoaded: SoftwareEngine.Mesh[]) {
    meshes = meshesLoaded;
    requestAnimationFrame(gameLoop);
}

function handleInput() {
    let dir = camera.Position.subtract(camera.Target).scale(0.015);
    
    if(keys[87] && (camera.Position.subtract(camera.Target)).length() > 5)
        camera.Position.subtractInPlace(dir);

    if(keys[83] && (camera.Position.subtract(camera.Target)).length() < 10)
        camera.Position.addInPlace(dir);

    // Left
    if(keys[65])
        meshes[0].Rotation.y -= 0.06;
    
    // Right
    if(keys[68])
        meshes[0].Rotation.y += 0.06;
}

function gameLoop() {
    stats.begin();
    
    device.clear();
    
    handleInput();
    
    meshes.forEach(mesh => {
        //mesh.Rotation.x += 0.01;
        //mesh.Rotation.y += 0.01;
        
    });    
    
    device.render(camera, meshes);
    
    device.flipBuffers();
    
    stats.end();
    
    requestAnimationFrame(gameLoop);
}

function handleKeyDown(ev: KeyboardEvent) {
    keys[ev.keyCode] = true;
}

function handleKeyUp(ev: KeyboardEvent) {
    keys[ev.keyCode] = false;
}

window.addEventListener("load", setUpEngine);
window.addEventListener("keydown", handleKeyDown);
window.addEventListener("keyup", handleKeyUp);