import * as TypeORM from "typeorm";
import Model from "./common";
 
declare var syzoj: any;
 
@TypeORM.Entity()
export default class Message extends Model {
  static cache = false;
 
  @TypeORM.PrimaryGeneratedColumn()
  id: number;
 
  @TypeORM.Index()
  @TypeORM.Column({ nullable: false, type: "integer" })
  sender_id: number;
 
  @TypeORM.Index()
  @TypeORM.Column({ nullable: false, type: "integer" })
  receiver_id: number;
 
  @TypeORM.Column({ nullable: false, type: "text" })
  content: string;
 
  @TypeORM.Column({ nullable: false, type: "boolean", default: false })
  is_read: boolean;
 
  @TypeORM.Column({ nullable: false, type: "integer" })
  send_time: number;
}