// <reference path="babylon.math.ts">
var SoftwareEngine;
(function (SoftwareEngine) {
    // The camera that watches the object
    class Camera {
        constructor() {
            this.Position = BABYLON.Vector3.Zero();
            this.Target = BABYLON.Vector3.Zero();
        }
    }
    SoftwareEngine.Camera = Camera;
    // A mesh is a named bunch of vertices
    class Mesh {
        constructor(name, verticesCount, faceCount) {
            this.name = name;
            this.Vertices = new Array(verticesCount);
            this.Faces = new Array(faceCount);
            this.Rotation = new BABYLON.Vector3(0, 0, 0);
            this.Position = new BABYLON.Vector3(0, 0, 0);
        }
        computeFaceNormals() {
            for (let i = 0; i < this.Faces.length; ++i) {
                let face = this.Faces[i];
                let vA = this.Vertices[face.A], vB = this.Vertices[face.B], vC = this.Vertices[face.C];
                this.Faces[i].Normal = (vA.Normal.add(vB.Normal.add(vC.Normal))).scale(1 / 3);
                this.Faces[i].Normal.normalize();
            }
        }
    }
    SoftwareEngine.Mesh = Mesh;
    class Device {
        constructor(canvas) {
            this.canvas = canvas;
            this.width = canvas.width;
            this.height = canvas.height;
            this.ctx = this.canvas.getContext("2d");
            this.depthBuffer = new Array(this.width * this.height);
        }
        clear() {
            this.ctx.clearRect(0, 0, this.width, this.height);
            this.backBuffer = this.ctx.getImageData(0, 0, this.width, this.height);
            for (let i = 0; i < this.depthBuffer.length; ++i)
                this.depthBuffer[i] = 10000000;
        }
        setPixel(x, y, z, color) {
            this.backBufferData = this.backBuffer.data;
            let i = ((x >> 0) + (y >> 0) * this.width);
            let i4 = i * 4;
            if (this.depthBuffer[i] < z) {
                return;
            }
            this.depthBuffer[i] = z;
            this.backBufferData[i4] = color.r * 255;
            this.backBufferData[i4 + 1] = color.g * 255;
            this.backBufferData[i4 + 2] = color.b * 255;
            this.backBufferData[i4 + 3] = color.a * 255;
        }
        drawPoint(point, color) {
            if (point.x >= 0 && point.y >= 0
                && point.x < this.width && point.y < this.height) {
                this.setPixel(point.x, point.y, point.z, color);
            }
        }
        flipBuffers() {
            this.ctx.putImageData(this.backBuffer, 0, 0);
        }
        clamp(value, min = 0, max = 1) {
            return Math.max(min, Math.min(value, max));
        }
        interpolate(min, max, gradient) {
            return min + (max - min) * this.clamp(gradient);
        }
        project(p, transMat, world) {
            let point2D = BABYLON.Vector3.TransformCoordinates(p.Coordinates, transMat);
            let point3D = BABYLON.Vector3.TransformCoordinates(p.Coordinates, world);
            let normal3D = BABYLON.Vector3.TransformCoordinates(p.Normal, world);
            let x = point2D.x * this.width + this.width / 2.0, y = -point2D.y * this.height + this.height / 2.0;
            return ({
                Coordinates: new BABYLON.Vector3(x, y, point2D.z),
                Normal: normal3D,
                WorldCoordinates: point3D,
                TextureCoordinates: p.TextureCoordinates
            });
        }
        processScanLine(data, va, vb, vc, vd, color, texture) {
            let pa = va.Coordinates, pb = vb.Coordinates, pc = vc.Coordinates, pd = vd.Coordinates;
            let gr1 = pa.y != pb.y ? (data.currentY - pa.y) / (pb.y - pa.y) : 1, gr2 = pc.y != pd.y ? (data.currentY - pc.y) / (pd.y - pc.y) : 1;
            let sx = this.interpolate(pa.x, pb.x, gr1) >> 0, ex = this.interpolate(pc.x, pd.x, gr2) >> 0;
            let z1 = this.interpolate(pa.z, pb.z, gr1), z2 = this.interpolate(pc.z, pd.z, gr2);
            let snl = this.interpolate(data.ndotla, data.ndotlb, gr1), enl = this.interpolate(data.ndotlc, data.ndotld, gr2);
            let su = this.interpolate(data.ua, data.ub, gr1), eu = this.interpolate(data.uc, data.ud, gr2), sv = this.interpolate(data.va, data.vb, gr1), ev = this.interpolate(data.vc, data.vd, gr2);
            let z, grad, dif = ex - sx, ndotl, u, v, texCol;
            for (let x = sx; x < ex; ++x) {
                grad = (x - sx) / dif;
                z = this.interpolate(z1, z2, grad);
                ndotl = this.interpolate(snl, enl, grad);
                u = this.interpolate(su, eu, grad);
                v = this.interpolate(sv, ev, grad);
                if (texture)
                    texCol = texture.map(u, v);
                else
                    texCol = new BABYLON.Color4(1, 1, 1, 1);
                this.drawPoint(new BABYLON.Vector3(x, data.currentY, z), new BABYLON.Color4(color.r * ndotl * texCol.r, color.g * ndotl * texCol.g, color.b * ndotl * texCol.b, 1));
            }
        }
        computeNDotL(vertex, normal, lightPos) {
            let lightDir = lightPos.subtract(vertex);
            normal.normalize();
            lightDir.normalize();
            return Math.max(0, BABYLON.Vector3.Dot(normal, lightDir));
        }
        drawTriangle(v1, v2, v3, color, texture) {
            // Sort for order p1 < p2 < p3
            if (v1.Coordinates.y > v2.Coordinates.y) {
                let t = v2;
                v2 = v1;
                v1 = t;
            }
            if (v2.Coordinates.y > v3.Coordinates.y) {
                let t = v2;
                v2 = v3;
                v3 = t;
            }
            if (v1.Coordinates.y > v2.Coordinates.y) {
                let t = v2;
                v2 = v1;
                v1 = t;
            }
            let p1 = v1.Coordinates, p2 = v2.Coordinates, p3 = v3.Coordinates;
            let nl1 = this.computeNDotL(v1.WorldCoordinates, v1.Normal, Device.lightPos), nl2 = this.computeNDotL(v2.WorldCoordinates, v2.Normal, Device.lightPos), nl3 = this.computeNDotL(v3.WorldCoordinates, v3.Normal, Device.lightPos);
            let data = {};
            // Inverted slopes
            let mP1P2, mP1P3;
            if (p2.y - p1.y > 0)
                mP1P2 = (p2.x - p1.x) / (p2.y - p1.y);
            else
                mP1P2 = 0;
            if (p3.y - p1.y > 0)
                mP1P3 = (p3.x - p1.x) / (p3.y - p1.y);
            else
                mP1P3 = 0;
            if (mP1P2 > mP1P3) {
                for (let y = p1.y >> 0; y <= p3.y >> 0; ++y) {
                    data.currentY = y;
                    if (y < p2.y) {
                        data.ndotla = nl1;
                        data.ndotlb = nl3;
                        data.ndotlc = nl1;
                        data.ndotld = nl2;
                        data.ua = v1.TextureCoordinates.x;
                        data.ub = v3.TextureCoordinates.x;
                        data.uc = v1.TextureCoordinates.x;
                        data.ud = v2.TextureCoordinates.x;
                        data.va = v1.TextureCoordinates.y;
                        data.vb = v3.TextureCoordinates.y;
                        data.vc = v1.TextureCoordinates.y;
                        data.vd = v2.TextureCoordinates.y;
                        this.processScanLine(data, v1, v3, v1, v2, color, texture);
                    }
                    else {
                        data.ndotla = nl1;
                        data.ndotlb = nl3;
                        data.ndotlc = nl2;
                        data.ndotld = nl3;
                        data.ua = v1.TextureCoordinates.x;
                        data.ub = v3.TextureCoordinates.x;
                        data.uc = v2.TextureCoordinates.x;
                        data.ud = v3.TextureCoordinates.x;
                        data.va = v1.TextureCoordinates.y;
                        data.vb = v3.TextureCoordinates.y;
                        data.vc = v2.TextureCoordinates.y;
                        data.vd = v3.TextureCoordinates.y;
                        this.processScanLine(data, v1, v3, v2, v3, color, texture);
                    }
                }
            }
            else {
                for (let y = p1.y >> 0; y <= p3.y >> 0; ++y) {
                    data.currentY = y;
                    if (y < p2.y) {
                        data.ndotla = nl1;
                        data.ndotlb = nl2;
                        data.ndotlc = nl1;
                        data.ndotld = nl3;
                        data.ua = v1.TextureCoordinates.x;
                        data.ub = v2.TextureCoordinates.x;
                        data.uc = v1.TextureCoordinates.x;
                        data.ud = v3.TextureCoordinates.x;
                        data.va = v1.TextureCoordinates.y;
                        data.vb = v2.TextureCoordinates.y;
                        data.vc = v1.TextureCoordinates.y;
                        data.vd = v3.TextureCoordinates.y;
                        this.processScanLine(data, v1, v2, v1, v3, color, texture);
                    }
                    else {
                        data.ndotla = nl2;
                        data.ndotlb = nl3;
                        data.ndotlc = nl1;
                        data.ndotld = nl3;
                        data.ua = v2.TextureCoordinates.x;
                        data.ub = v3.TextureCoordinates.x;
                        data.uc = v1.TextureCoordinates.x;
                        data.ud = v3.TextureCoordinates.x;
                        data.va = v2.TextureCoordinates.y;
                        data.vb = v3.TextureCoordinates.y;
                        data.vc = v1.TextureCoordinates.y;
                        data.vd = v3.TextureCoordinates.y;
                        this.processScanLine(data, v2, v3, v1, v3, color, texture);
                    }
                }
            }
        }
        createMeshesFromJson(jsonObject) {
            var meshes = [];
            var materials = [];
            jsonObject.materials.forEach(mat => {
                let material = {};
                material.Name = mat.name;
                material.ID = mat.id;
                if (mat.diffuseTexture)
                    material.DiffuseTextureName = mat.diffuseTexture.name;
                materials[material.ID] = material;
            });
            jsonObject.meshes.forEach(mesh => {
                let vertices = mesh.vertices;
                let indices = mesh.indices;
                let uvCount = mesh.uvCount;
                let verticesStep = 1;
                switch (uvCount) {
                    case 0:
                        verticesStep = 6;
                        break;
                    case 1:
                        verticesStep = 8;
                        break;
                    case 2:
                        verticesStep = 10;
                        break;
                }
                let verticesCount = vertices.length / verticesStep;
                let facesCount = indices.length / 3;
                let theMesh = new Mesh(mesh.name, verticesCount, facesCount);
                for (let i = 0; i < verticesCount; ++i) {
                    theMesh.Vertices[i] = {
                        Coordinates: new BABYLON.Vector3(vertices[i * verticesStep], vertices[i * verticesStep + 1], vertices[i * verticesStep + 2]),
                        Normal: new BABYLON.Vector3(vertices[i * verticesStep + 3], vertices[i * verticesStep + 4], vertices[i * verticesStep + 5]),
                        WorldCoordinates: null,
                        TextureCoordinates: null
                    };
                    if (uvCount > 0) {
                        let u = vertices[i * verticesStep + 6], v = vertices[i * verticesStep + 7];
                        theMesh.Vertices[i].TextureCoordinates = new BABYLON.Vector2(u, v);
                    }
                    else {
                        theMesh.Vertices[i].TextureCoordinates = new BABYLON.Vector2(0, 0);
                    }
                }
                for (let i = 0; i < facesCount; ++i)
                    theMesh.Faces[i] = {
                        A: indices[i * 3],
                        B: indices[i * 3 + 1],
                        C: indices[i * 3 + 2]
                    };
                let pos = mesh.position;
                mesh.Position = new BABYLON.Vector3(pos[0], pos[1], pos[2]);
                if (uvCount > 0) {
                    let meshTextureId = mesh.materialId, meshTextureName = materials[meshTextureId].DiffuseTextureName;
                    theMesh.Texture = new Texture(meshTextureName, 512, 512);
                }
                theMesh.computeFaceNormals();
                meshes.push(theMesh);
            });
            return meshes;
        }
        loadJsonFileAsync(path, callback) {
            var jsonObject = {};
            var xmlHttp = new XMLHttpRequest();
            xmlHttp.open("GET", path, true);
            var that = this;
            xmlHttp.onreadystatechange = function () {
                if (xmlHttp.readyState == 4 && xmlHttp.status == 200) {
                    jsonObject = JSON.parse(xmlHttp.responseText);
                    callback(that.createMeshesFromJson(jsonObject));
                }
            };
            xmlHttp.send(null);
        }
        render(camera, meshes) {
            this.viewMatrix = BABYLON.Matrix.LookAtLH(camera.Position, camera.Target, BABYLON.Vector3.Up());
            this.projMatrix = BABYLON.Matrix.PerspectiveFovLH(1, this.width / this.height, 0.01, 1.0);
            meshes.forEach(mesh => {
                this.worldMatrix = BABYLON.Matrix.RotationYawPitchRoll(mesh.Rotation.y, mesh.Rotation.x, mesh.Rotation.z).multiply(BABYLON.Matrix.Translation(mesh.Position.x, mesh.Position.y, mesh.Position.z));
                this.transformMatrix = this.worldMatrix.multiply(this.viewMatrix).multiply(this.projMatrix);
                mesh.Faces.forEach(face => {
                    let trnNormal = BABYLON.Vector3.TransformNormal(face.Normal, this.worldMatrix);
                    if (trnNormal.z < 0) {
                        let a = mesh.Vertices[face.A];
                        let b = mesh.Vertices[face.B];
                        let c = mesh.Vertices[face.C];
                        let pxA = this.project(a, this.transformMatrix, this.worldMatrix);
                        let pxB = this.project(b, this.transformMatrix, this.worldMatrix);
                        let pxC = this.project(c, this.transformMatrix, this.worldMatrix);
                        let color = 1.0;
                        this.drawTriangle(pxA, pxB, pxC, new BABYLON.Color4(color, color, color, 1), mesh.Texture);
                    }
                });
            });
        }
    }
    Device.lightPos = new BABYLON.Vector3(0, 5, -15);
    SoftwareEngine.Device = Device;
    class Texture {
        constructor(path, width, height) {
            this.width = width;
            this.height = height;
            this.load(path);
        }
        load(path) {
            let imageTex = new Image();
            imageTex.width = this.width;
            imageTex.height = this.height;
            imageTex.onload = () => {
                let cvs = document.createElement("canvas");
                cvs.width = this.width;
                cvs.height = this.height;
                let ctx = cvs.getContext("2d");
                ctx.drawImage(imageTex, 0, 0);
                this.internalBuffer = ctx.getImageData(0, 0, this.width, this.height);
            };
            imageTex.src = path;
        }
        map(u, v) {
            if (this.internalBuffer) {
                u = Math.abs((u * this.width) % this.width) >> 0;
                v = Math.abs((v * this.height) % this.height) >> 0;
                let pos = (u + v * this.width) * 4;
                let r = this.internalBuffer.data[pos], g = this.internalBuffer.data[pos + 1], b = this.internalBuffer.data[pos + 2], a = this.internalBuffer.data[pos + 3];
                return new BABYLON.Color4(r / 255.0, g / 255.0, b / 255.0, a / 255.0);
            }
            else {
                return new BABYLON.Color4(1, 1, 1, 1);
            }
        }
    }
    SoftwareEngine.Texture = Texture;
})(SoftwareEngine || (SoftwareEngine = {}));
