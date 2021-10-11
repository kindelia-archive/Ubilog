use tokio;

#[tokio::main]
async fn main(){
    let _socket = tokio::net::UdpSocket::bind("127.0.0.1:42000").await.unwrap();

    println!("Hello, world!");
}
