import express, {NextFunction, Request, Response} from "express";
import jwt, { JwtPayload } from "jsonwebtoken"
import "dotenv/config"
import { PrismaClient } from "../../generated/prisma";
import multer from "multer";
import path from "path";

const router = express.Router();
const prisma = new PrismaClient()
router.use(express.json())
const verifyToken = (req : Request, res : Response, next : NextFunction) => {
    const token = req.headers.authorization?.split(" ")[1] 
    try{
        if(token){
            const decoded = jwt.verify(token, process.env.JWT_SECRET as string) 
            console.log("hasil decoded : ", decoded);
            //@ts-ignore
            req.userId = decoded.userId
            next()
    }
    }catch(err){
        res.status(401).json({
            success : false,
            message : err
        })
    }   
    }

const storage = multer.diskStorage({
    destination: (_, __, cb) => {
    cb(null, 'src/public/images/'); 
    },
    filename: (_, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, Date.now() + ext); 
    },
});
    
const upload = multer({ storage: storage });

router.post("/create", verifyToken, upload.array("postImage",5) , async (req : Request, res : Response) => {
    const {itemName = null, itemDetail = null, itemCategory = null, itemStatus = null, itemLatitude = null, itemLongitude = null, locationName = null, itemLostDate = null, } = req.body
    console.log(itemName,itemCategory,itemDetail,itemLostDate,itemStatus)
    try{
        if(!itemName){
            throw new Error("Nama barang yang hilang masih kosong")
        }
        if(!itemDetail){
            throw new Error("Deskripsi barang yang hilang masih kosong")
        }
        if(!itemCategory){
            throw new Error("Kategori barang yang hilang masih kosong")
        }
        if(!itemLatitude){
            throw new Error("Latitude Barang masih kosong")
        }
        if(!itemLongitude){
            throw new Error("Longitude Barang masih kosong")
        }

        console.log("requirement completed")
        const statusId = await prisma.postStatus.findUnique({
            where : {
                statusName : "Hilang"
            }
        })
    
        const categoryId = await prisma.postCategory.findUnique({
            where : {
                categoryName : itemCategory
            }
        })
        let imageArray = []
        if(req.files && (req.files.length as number) > 0){
            console.log("Gambar berhasil diupload : ", req.files.length )
            imageArray = (req.files as Express.Multer.File[]).map((v,i) => {
                return {
                    postImageUrl : v.filename
                }
            })
        }else{
            throw new Error("Mohon Masukkan Gambar")
        }
        
        if(statusId && categoryId){
            console.log({
                itemName,
                itemDetail,
                //@ts-ignore
                userId : req.userId,
                categoryId : categoryId.id,
                statusId : statusId.id
            })
            const posts = await prisma.post.create({
                data : {
                    itemName : itemName,
                    itemDetail : itemDetail,
                    itemLostDate : new Date(itemLostDate),
                    //@ts-ignore
                    userId : req.userId,
                    categoryId : categoryId.id,
                    statusId : statusId.id,
                    image : {
                        create : imageArray
                    },
                    coordinate : {
                        create : {
                            locationName : locationName,
                            latitude : Number((itemLatitude as string)),
                            longitude : Number((itemLongitude as string))
                        }
                    }
                }
            })
            res.status(200).json({
                success : true,
                message : "Barang Hilang telah dibuat",
                data : {
                    id : posts.id,
                    name : posts.itemName
                }
            })
        }else{
            res.status(400).json({
                success : false,
                message : `${!statusId ? "Status" : ""}${(!statusId && !categoryId) ? " dan " : ""}${!categoryId ? "Kategori" : ""} tidak tersedia`
            })
        }
    }catch(err){
        console.log("error :", err)
        res.status(400).json({
            success : false,
            message : err
        })
    }
})

router.put("/edit/:id", verifyToken, async (req : Request, res : Response) => {
    console.log("test : ", req.params.id)
    const {itemName = null, itemCategory = null, itemStatus = null, itemDetail = null} = req.body
    const oldPost = await prisma.post.findUnique({
        where : {
            id : req.params.id
        }
    })
    let statusId ;
    let categoryId ;
    if(itemStatus){
         statusId = await prisma.postStatus.findUnique({
            where : {
                statusName : itemStatus
            }
        })
    }
    if(itemDetail){
         categoryId = await prisma.postCategory.findUnique({
            where : {
                categoryName : itemCategory
            }
        })
    }
 

    if(oldPost){
        const newPost = await prisma.post.update({
            where : {
                id : req.params.id
            },
            data : {
                id : req.params.id,
                itemName : itemName ? itemName : oldPost.itemName,
                itemDetail : itemDetail ? itemDetail : oldPost.itemDetail,
                statusId : itemStatus ? statusId?.id : oldPost.statusId,
                categoryId : itemStatus ? categoryId?.id : oldPost.categoryId,
                updated_at : new Date(),
                created_at : oldPost.created_at
            }
        })
        res.status(200).json({
            success : true,
            message : newPost
        })
    }else{
        res.status(404).json({
            status : false,
            message : "Post yang ingin diedit tidak ditemukan"
        })
    }
   
})

router.get("/", verifyToken, async (req : Request, res : Response) => {
    const posts = await prisma.post.findMany({
        select : {
            id : true,
            status : {
                select : {
                    statusName : true
                }
            },
            category : {
                select : {
                    categoryName : true
                }
            },
            created_at : true,
            updated_at : true,
            itemDetail : true,
            itemName : true,
            image :  {
                select : {
                    postImageUrl : true
                }
            },
            coordinate : true
        }
    });

    const formattedPosts = posts.map((v) => {
        return {
            id : v.id,
            itemName : v.itemName,
            itemDetail : v.itemDetail,
            statusName : v.status.statusName,
            categoryName : v.category.categoryName,
            images : v.image,
            created_at : v.created_at,
            updated_at : v.updated_at,
            coordinate : {
                latitude : v.coordinate?.latitude,
                longitude : v.coordinate?.longitude
            }

        }
    })
    res.status(200).json({
        success : true,
        data : formattedPosts
    })
})

router.delete("/:id", verifyToken, async (req : Request, res : Response) => {
    if(req.params.id){
        try{
            await prisma.post.delete({where : {
                id : req.params.id
            }})
        }catch(err){
            res.status(400).json({
                success : true,
                message : err
            })
        }
    }
})

router.get("/userpost", verifyToken, async (req : Request, res : Response) => {
    try{
        const findPost = await prisma.post.findMany({
            where : {
                //@ts-ignore
                userId : req.userId
            }
        })
        if(findPost){
            res.status(200).json({
                success : true,
                message : "Data berhasil diperoleh",
                data : findPost
            })
        }
    }catch(e){
        res.status(400).json({
            success : false,
            message : e
        })
    }
})



export {router as postRouter }

